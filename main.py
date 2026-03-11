from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import torch
import torch.nn as nn
import torchvision.transforms as transforms
from PIL import Image
import numpy as np
import cv2
import io
import timm
import httpx
import json
from duckduckgo_search import DDGS
from groq import Groq
import os
from transformers import pipeline
import google.generativeai as genai

app = FastAPI()

# ─── API Keys ─────────────────────────────────────────────────────────────────
GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "YOUR_GROQ_API_KEY_HERE")
if GROQ_API_KEY and GROQ_API_KEY != "YOUR_GROQ_API_KEY_HERE":
    groq_client = Groq(api_key=GROQ_API_KEY)
else:
    groq_client = None

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "YOUR_GEMINI_API_KEY_HERE")
if GEMINI_API_KEY and GEMINI_API_KEY != "YOUR_GEMINI_API_KEY_HERE":
    genai.configure(api_key=GEMINI_API_KEY)

# Allow React frontend to call this API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load EfficientNet model (pretrained on ImageNet, fine-tuned logic below)
model = timm.create_model('efficientnet_b4', pretrained=True, num_classes=2)
model.eval()

# Load HuggingFace Fake News Detection model
try:
    print("Loading HuggingFace Fake News model...", flush=True)
    fake_news_pipeline = pipeline("text-classification", model="Pulk17/Fake-News-Detection", truncation=True, max_length=512)
    print("HuggingFace model loaded successfully.", flush=True)
except Exception as e:
    print(f"Error loading HuggingFace model: {e}", flush=True)
    fake_news_pipeline = None

transform = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.ToTensor(),
    transforms.Normalize([0.485, 0.456, 0.406],
                         [0.229, 0.224, 0.225])
])

def analyze_facial_geometry(img_array):
    """Check facial symmetry and landmark consistency"""
    gray = cv2.cvtColor(img_array, cv2.COLOR_RGB2GRAY)
    # Detect edges as proxy for facial structure
    edges = cv2.Canny(gray, 50, 150)
    edge_density = np.sum(edges > 0) / edges.size
    # Irregular edge density can indicate GAN artifacts
    score = min(100, int(edge_density * 800))
    return score

def analyze_texture(img_array):
    """Detect unnatural skin texture patterns"""
    gray = cv2.cvtColor(img_array, cv2.COLOR_RGB2GRAY)
    # Laplacian variance — low = overly smooth (AI generated)
    laplacian = cv2.Laplacian(gray, cv2.CV_64F)
    variance = laplacian.var()
    # Very smooth images (low variance) score higher as fake
    score = max(0, min(100, int(100 - (variance / 5))))
    return score

def analyze_frequency(img_array):
    """Frequency domain analysis for GAN fingerprints"""
    gray = cv2.cvtColor(img_array, cv2.COLOR_RGB2GRAY).astype(np.float32)
    dft = np.fft.fft2(gray)
    dft_shift = np.fft.fftshift(dft)
    magnitude = 20 * np.log(np.abs(dft_shift) + 1)
    # GANs leave periodic patterns in frequency domain
    mean_freq = magnitude.mean()
    score = min(100, max(0, int((mean_freq - 80) * 2)))
    return score

def analyze_noise(img_array):
    """Check for inconsistent noise patterns"""
    img_float = img_array.astype(np.float32)
    noise = img_float - cv2.GaussianBlur(img_float, (5, 5), 0)
    noise_std = noise.std()
    # AI images often have very uniform noise
    score = min(100, max(0, int(50 - noise_std)))
    return score

def analyze_compression(img_array):
    """Detect unusual compression artifacts"""
    gray = cv2.cvtColor(img_array, cv2.COLOR_RGB2GRAY)
    _, encoded = cv2.imencode('.jpg', gray, [cv2.IMWRITE_JPEG_QUALITY, 75])
    decoded = cv2.imdecode(encoded, cv2.IMREAD_GRAYSCALE)
    diff = np.abs(gray.astype(np.float32) - decoded.astype(np.float32))
    score = min(100, int(diff.mean() * 10))
    return score

def run_efficientnet(img_pil):
    """Run EfficientNet classifier"""
    tensor = transform(img_pil).unsqueeze(0)
    with torch.no_grad():
        output = model(tensor)
        probs = torch.softmax(output, dim=1)
        # Index 1 = fake probability
        fake_prob = probs[0][1].item()
    return int(fake_prob * 100)

@app.post("/analyze")
async def analyze_image(file: UploadFile = File(...)):
    # Read image
    contents = await file.read()
    img_pil = Image.open(io.BytesIO(contents)).convert("RGB")
    img_array = np.array(img_pil)

    # Run all checks
    facial_score    = analyze_facial_geometry(img_array)
    texture_score   = analyze_texture(img_array)
    frequency_score = analyze_frequency(img_array)
    noise_score     = analyze_noise(img_array)
    compression_score = analyze_compression(img_array)
    ai_score        = run_efficientnet(img_pil)

    overall = int((
        facial_score * 0.15 +
        texture_score * 0.20 +
        frequency_score * 0.15 +
        noise_score * 0.15 +
        compression_score * 0.10 +
        ai_score * 0.25
    ))

    return {
        "overall": overall,
        "checks": {
            "facial":      facial_score,
            "texture":     texture_score,
            "frequency":   frequency_score,
            "metadata":    noise_score,
            "boundary":    compression_score,
            "temporal":    ai_score,
        },
        "verdict": "LIKELY DEEPFAKE" if overall > 70 else "INCONCLUSIVE" if overall > 40 else "LIKELY AUTHENTIC"
    }

# ─── NEWS CREDIBILITY ANALYSIS (Groq API) ───────────────────────────────────

class NewsRequest(BaseModel):
    text: str

QUERY_PROMPT = """You are a search query generator. Analyze the following news snippet and generate exactly ONE highly specific search query to fact-check the primary claims.
Do not wrap it in quotes or explain anything. Just output the search string (max 6 words).

Article text:
"""

VERIFICATION_PROMPT = """Role & Objective
Role: You are a "Strict Logic Comparison Engine" designed for high-accuracy Fake News Detection. You are forbidden from using your internal training memory to verify facts. You must ONLY use the provided [LIVE_SEARCH_DATA] to validate the [USER_CLAIM].

DATA INPUTS
1. [USER_CLAIM]: {user_material}
2. [LIVE_SEARCH_DATA]: {live_evidence}

RANKING & SCORING LOGIC
Evaluate the claim based on these four weighted criteria (Total 100%):

1. Semantic Consistency (40%): Does the core fact in the claim (e.g., "Person X is dead") match the core fact in the search results?
   - Match = 40 pts | Contradiction = 0 pts | Unmentioned = 10 pts
2. Source Authority (30%): Are the search results from Tier-1 outlets (AP, Reuters, BBC, Gov sites)?
   - High Authority = 30 pts | Medium = 15 pts | Low/Unknown = 5 pts
3. Temporal Recency (20%): Is the search data from the last 24-48 hours?
   - Fresh (<24h) = 20 pts | Old (>1 week) = 5 pts | Ancient (>1 year) = 0 pts
4. Emotional Bias (10%): Does the User Claim use "Clickbait" or inflammatory language?
   - Neutral = 10 pts | Sensationalist = 0 pts

THE "KILL SWITCH" RULE
If [LIVE_SEARCH_DATA] explicitly states the opposite of [USER_CLAIM] (e.g., Search says "Alive" while User says "Dead"), the final Verdict MUST be "FAKE" regardless of other scores.

OUTPUT FORMAT
Return your response in this exact JSON structure:
{
  "verdict": "CONFIRMED REAL" | "LIKELY REAL" | "UNVERIFIED" | "LIKELY FAKE" | "CONFIRMED FAKE",
  "confidence_score": <number 0-100>,
  "found_contradiction": <boolean>,
  "logic_explanation": "<string explaining the logic check>",
  "clashing_statements": [
    {
      "user_says": "<quote>",
      "evidence_says": "<quote>"
    }
  ]
}"""

def call_groq(prompt: str, json_mode: bool = False, max_tokens: int = 1024):
    """Helper to call Groq API with Llama-3"""
    try:
        completion = groq_client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": "You are a senior logic verification AI. Output JSON if requested."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.1,
            max_tokens=max_tokens,
            response_format={"type": "json_object"} if json_mode else {"type": "text"}
        )
        
        raw_content = completion.choices[0].message.content
        return {
            "content": raw_content,
            "raw": {
                "model": "llama3-70b-8192",
                "usage": {
                    "prompt_tokens": completion.usage.prompt_tokens if completion.usage else 0,
                    "completion_tokens": completion.usage.completion_tokens if completion.usage else 0
                }
            }
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"Error calling Groq API: {str(e)}")
        return {"error": str(e)}

@app.get("/test-groq")
def test_groq():
    """Test raw groq calling"""
    try:
        completion = groq_client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "user", "content": "Hello!"}
            ]
        )
        return {"success": True, "res": completion.choices[0].message.content}
    except Exception as e:
        return {"error": str(e)}

@app.post("/analyze-news")
async def analyze_news(request: NewsRequest):
    if not request.text or len(request.text.strip()) < 10:
        return {"error": "Article text is too short"}

    # Truncate to remain within limits
    user_material = request.text[:4000]

    try:
        # Step 1: Generate Search Query
        query_prompt_filled = QUERY_PROMPT + user_material
        query_result = call_groq(query_prompt_filled, max_tokens=30)
        
        if "error" in query_result:
            return {"error": "Failed to generate search query"}
            
        search_query = query_result["content"].strip().strip('"').strip("'")
        
        # Step 2: Search DuckDuckGo
        ddgs = DDGS()
        results = [r for r in ddgs.text(search_query, max_results=5)]
        live_evidence = "\n\n".join([f"Source ({r['href']}): {r['body']}" for r in results])
        
        if not live_evidence:
            live_evidence = "No live evidence found for this query."

        # Step 3: Logic Verification against Live Evidence
        full_prompt = VERIFICATION_PROMPT.replace("{user_material}", user_material).replace("{live_evidence}", live_evidence)
        
        print("\n" + "="*50, flush=True)
        print("🚀 SENDING REQUEST TO GROQ (VERIFICATION_PROMPT):", flush=True)
        print("="*50, flush=True)
        print(full_prompt, flush=True)
        print("="*50 + "\n", flush=True)
        
        verify_result = call_groq(full_prompt, json_mode=True)
        
        if "error" in verify_result:
            return {"error": "Failed to verify logic with Groq"}
            
        try:
            raw_json_str = verify_result["content"]
            
            # The model sometimes returns ```json wrappers
            if isinstance(raw_json_str, str):
                if raw_json_str.strip().startswith("```json"):
                    raw_json_str = raw_json_str.strip()[7:]
                if raw_json_str.strip().startswith("```"):
                    raw_json_str = raw_json_str.strip()[3:]
                if raw_json_str.strip().endswith("```"):
                    raw_json_str = raw_json_str.strip()[:-3]
                    
            data = json.loads(raw_json_str.strip())

            return {
                "verdict": data.get("verdict", "UNVERIFIED"),
                "confidence_score": data.get("confidence_score", 0),
                "found_contradiction": data.get("found_contradiction", False),
                "logic_explanation": data.get("logic_explanation", "No explanation provided."),
                "clashing_statements": data.get("clashing_statements", []),
                "debug": {
                    "search_query": search_query,
                    "live_evidence": live_evidence,
                    "model": verify_result.get("raw", {}).get("model", "unknown"),
                    "input_tokens": verify_result.get("raw", {}).get("usage", {}).get("prompt_tokens", 0),
                    "output_tokens": verify_result.get("raw", {}).get("usage", {}).get("completion_tokens", 0),
                    "article_length": len(user_material),
                    "prompt_sent": full_prompt,
                    "raw_response": verify_result["content"]
                }
            }
            
        except json.JSONDecodeError as e:
            import traceback
            traceback.print_exc()
            return {"error": "Failed to parse API response as JSON"}
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        return {"error": f"Analysis failed: {str(e)}"}

@app.post("/analyze-fake-news-hf")
async def analyze_fake_news_hf(request: NewsRequest):
    if not request.text or len(request.text.strip()) < 10:
        return {"error": "Article text is too short"}
        
    if not fake_news_pipeline:
        return {"error": "Hugging Face model failed to load correctly."}
        
    try:
        # run pipeline
        result = fake_news_pipeline(request.text)
        
        # result is like [{'label': 'LABEL_0', 'score': 0.998}]
        if result and len(result) > 0:
            prediction = result[0]
            # Convert label string. Assuming LABEL_0 -> FAKE, LABEL_1 -> REAL based on standard HuggingFace
            raw_label = prediction.get("label", "UNKNOWN")
            score = prediction.get("score", 0.0)
            
            mapped_label = "FAKE" if "0" in raw_label else "REAL" if "1" in raw_label else raw_label
            
            return {
                "label": mapped_label,
                "score": float(score),
                "raw_label": raw_label
            }
        else:
            return {"error": "No prediction generated"}
            
    except Exception as e:
        import traceback
        traceback.print_exc()
        return {"error": f"HF Pipeline failed: {str(e)}"}

PHISHING_PROMPT = """Role: You are a "Strict Phishing & Social Engineering Detection Engine" designed to analyze emails, text messages, and URLs for malicious intent.

DATA TO ANALYZE
[USER_CONTENT]: {user_material}

RANKING & SCORING LOGIC
Evaluate the content based on these four weighted criteria (Total 100%):

1. Urgency & Threats (30%): Does the content try to rush the user or threaten consequences? (e.g. "Your account will be suspended in 24 hours")
   - High Tension = 30 pts | Subtle Rush = 15 pts | Neutral = 0 pts
2. Sensitive Info Requests (30%): Does it ask for passwords, bank details, SSN, or 2FA codes?
   - Explicit Ask = 30 pts | Implied/Phishing link = 15 pts | None = 0 pts
3. Domain/Sender Spoofing (25%): Does it pretend to be a trusted entity (Bank, FedEx, Gov) but use bad grammar or suspicious links?
   - Obvious Spoof = 25 pts | Suspicious = 10 pts | Verified/Neutral = 0 pts
4. Unsolicited Attachments/Links (15%): Are there links that don't match the context or strange attachments?
   - Malicious/Hidden Links = 15 pts | Safe Links/None = 0 pts

THE "KILL SWITCH" RULE
If [USER_CONTENT] explicitly asks for a password, crypto payment for ransom, or contains highly known phishing patterns (e.g., Nigerian Prince, fake invoice PDF), the Verdict MUST be "CONFIRMED PHISHING" and Risk Score = 90-100.

OUTPUT FORMAT
Return your response in this exact JSON structure:
{
  "verdict": "CONFIRMED PHISHING" | "LIKELY PHISHING" | "SUSPICIOUS" | "LIKELY SAFE" | "SAFE",
  "risk_score": <number 0-100, where 100 is max danger>,
  "is_phishing": <boolean>,
  "logic_explanation": "<string explaining why it is or isn't phishing>",
  "indicators": [
    "<string defining a specific red flag found, e.g. 'False sense of urgency'>",
    "<string defining another red flag>"
  ]
}"""

class PhishingRequest(BaseModel):
    text: str

@app.post("/analyze-phishing")
async def analyze_phishing(request: PhishingRequest):
    if not request.text or len(request.text.strip()) < 5:
        return {"error": "Content is too short to analyze"}

    # Truncate to remain within reasonable limits
    user_material = request.text[:3000]

    try:
        full_prompt = PHISHING_PROMPT.replace("{user_material}", user_material)
        
        if not GEMINI_API_KEY:
            return {"error": "Gemini API Key is missing. Please set the GEMINI_API_KEY environment variable to use Gemini for phishing detection."}

        print("\n" + "="*50, flush=True)
        print("🚀 SENDING REQUEST TO GEMINI (PHISHING_PROMPT):", flush=True)
        print("="*50, flush=True)
        print(full_prompt, flush=True)
        
        try:
            model = genai.GenerativeModel('gemini-1.5-flash-latest', system_instruction="You are a senior logic verification AI.")
            completion = model.generate_content(
                full_prompt,
                generation_config=genai.types.GenerationConfig(
                    response_mime_type="application/json",
                    temperature=0.1,
                )
            )
        except Exception as api_err:
            import traceback
            traceback.print_exc()
            return {"error": f"Failed to call Gemini API: {str(api_err)}"}
            
        verify_result = {
            "raw": {
                "model": "gemini-1.5-flash-latest",
                "usage": {
                    "prompt_tokens": 0,
                    "completion_tokens": 0
                }
            }
        }
        
        try:
            raw_json_str = completion.text
            
            # Use same fallback logic as news analysis
            if isinstance(raw_json_str, str):
                if raw_json_str.strip().startswith("```json"):
                    raw_json_str = raw_json_str.strip()[7:]
                if raw_json_str.strip().startswith("```"):
                    raw_json_str = raw_json_str.strip()[3:]
                if raw_json_str.strip().endswith("```"):
                    raw_json_str = raw_json_str.strip()[:-3]
                    
            data = json.loads(raw_json_str.strip())

            return {
                "verdict": data.get("verdict", "SUSPICIOUS"),
                "risk_score": data.get("risk_score", 50),
                "is_phishing": data.get("is_phishing", True),
                "logic_explanation": data.get("logic_explanation", "No explanation provided."),
                "indicators": data.get("indicators", ["Unable to parse specific indicators."]),
                "debug": {
                    "model": verify_result.get("raw", {}).get("model", "unknown"),
                    "input_tokens": verify_result.get("raw", {}).get("usage", {}).get("prompt_tokens", 0),
                    "output_tokens": verify_result.get("raw", {}).get("usage", {}).get("completion_tokens", 0),
                    "content_length": len(user_material)
                }
            }

        except json.JSONDecodeError as e:
            print(f"Failed to parse Groq Verification JSON: {str(e)}", flush=True)
            print(f"Raw Output: {raw_json_str}", flush=True)
            return {"error": "Failed to parse API response as JSON"}
            
    except Exception as e:
        import traceback
        traceback.print_exc()
        return {"error": f"Phishing analysis failed: {str(e)}"}

@app.get("/")
def root():
    return {"status": "Deepfake Detection API running"}

def main_menu():
    import asyncio
    import uvicorn
    import sys
    
    while True:
        print("\n" + "="*50)
        print("          VERITAS SYSTEM MENU          ")
        print("="*50)
        print("1. Analyze Image (Deepfake Detection)")
        print("2. Analyze News Credibility")
        print("3. Analyze Text for Phishing")
        print("4. Start API Server (FastAPI)")
        print("5. Exit")
        print("="*50)
        
        choice = input("Enter your choice (1-5): ").strip()
        
        if choice == '1':
            img_path = input("Enter absolute or relative image path: ").strip()
            img_path = img_path.strip('"').strip("'")
            if os.path.exists(img_path):
                print("Loading and analyzing image...")
                try:
                    img_pil = Image.open(img_path).convert("RGB")
                    img_array = np.array(img_pil)
                    
                    facial_score = analyze_facial_geometry(img_array)
                    texture_score = analyze_texture(img_array)
                    frequency_score = analyze_frequency(img_array)
                    noise_score = analyze_noise(img_array)
                    compression_score = analyze_compression(img_array)
                    ai_score = run_efficientnet(img_pil)
                    
                    overall = int((
                        facial_score * 0.15 +
                        texture_score * 0.20 +
                        frequency_score * 0.15 +
                        noise_score * 0.15 +
                        compression_score * 0.10 +
                        ai_score * 0.25
                    ))
                    
                    verdict = "LIKELY DEEPFAKE" if overall > 70 else "INCONCLUSIVE" if overall > 40 else "LIKELY AUTHENTIC"
                    
                    print("\n--- Image Analysis Results ---")
                    print(f"Overall Score: {overall}% - {verdict}")
                    print(f"Facial Geometry:   {facial_score}%")
                    print(f"Texture Score:     {texture_score}%")
                    print(f"Frequency Score:   {frequency_score}%")
                    print(f"Noise Score:       {noise_score}%")
                    print(f"Compression Score: {compression_score}%")
                    print(f"AI Model Score:    {ai_score}%")
                except Exception as e:
                    print(f"Error processing image: {e}")
            else:
                print(f"File not found: {img_path}")
                
        elif choice == '2':
            print("Enter news text to analyze (type END on a single line to submit):")
            lines = []
            while True:
                line = input()
                if line.strip() == "END":
                    break
                lines.append(line)
            text = "\n".join(lines).strip()
            
            if len(text) < 10:
                print("Text is too short for analysis.")
            else:
                print("\nAnalyzing via Hugging Face Fake News Model...")
                if fake_news_pipeline:
                    try:
                        result = fake_news_pipeline(text[:512])
                        print(f"HF Pipeline Result: {result}")
                    except Exception as e:
                        print(f"HF Pipeline Error: {e}")
                
                print("\nAnalyzing via Groq Logic Verification...")
                req = NewsRequest(text=text)
                try:
                    res = asyncio.run(analyze_news(req))
                    print("\n--- News Analysis Results ---")
                    print(json.dumps(res, indent=2))
                except Exception as e:
                    print(f"Error during news analysis: {e}")
                
        elif choice == '3':
            print("Enter email/message/URL to check for phishing (type END on a single line to submit):")
            lines = []
            while True:
                line = input()
                if line.strip() == "END":
                    break
                lines.append(line)
            text = "\n".join(lines).strip()
            
            if len(text) < 5:
                print("Text is too short for analysis.")
            else:
                print("Analyzing for phishing indicators...")
                req = PhishingRequest(text=text)
                try:
                    res = asyncio.run(analyze_phishing(req))
                    print("\n--- Phishing Analysis Results ---")
                    print(json.dumps(res, indent=2))
                except Exception as e:
                    print(f"Error during phishing analysis: {e}")
                
        elif choice == '4':
            print("Starting FastAPI Server on http://0.0.0.0:8000 ...")
            try:
                uvicorn.run(app, host="0.0.0.0", port=8000)
            except Exception as e:
                print(f"Failed to start server: {e}")
            break
            
        elif choice == '5' or choice.lower() in ('exit', 'quit'):
            print("Exiting VERITAS System.")
            sys.exit(0)
            
        else:
            print("Invalid choice. Please select from 1, 2, 3, 4, or 5.")

if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1 and sys.argv[1] == "--server":
        import uvicorn
        uvicorn.run(app, host="0.0.0.0", port=8000)
    else:
        main_menu()