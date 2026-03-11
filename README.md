# FAKIES (Deepfake & AI Content Forensic Analysis System)

FAKIES is an OSINT (Open Source Intelligence) cyber-forensic application designed to detect AI-generated media and synthetic news. 

## How The AI Detection Works

FAKIES utilizes a multi-layered approach to verify media and text, combining specialized neural networks, heuristic analysis, and open-source intelligence cross-referencing.

### 1. Image & Deepfake Detection
The image analysis pipeline examines pixel-level data and file metadata to detect synthetic generation (GANs, Diffusion Models, etc.). It leverages the **Sightengine AI API** as the primary detection engine, wrapped alongside heuristic verifications:

*   **Pixel-Level Analysis:** The AI scanner analyzes the image for anomalies typical of diffusion models (like Midjourney or DALL-E) or generative adversarial networks (GANs). 
*   **Facial Geometry Analysis (Heuristic):** AI struggles with consistent human geometry. This check conceptually flags anomalies in pupil symmetry, ear alignment, and micro-expression artifacts.
*   **Texture Mapping (Heuristic):** Analyzes inconsistencies in skin pores, subsurface light scattering, and unnatural smooth patches often left by AI upscalers.
*   **Frequency Domain Analysis (Heuristic):** Deepfakes often leave invisible high-frequency "noise" fingerprints (DCT artifacts) when manipulating pixels. 
*   **Edge Boundary Detection (Heuristic):** Examines the blending lines around subjects (like hair transitions into backgrounds) where AI generation often fails or creates "ghosting."
*   **Metadata Forensics:** Checks camera EXIF data for tampering, missing shutter speeds, or compression histories that don't match authentic hardware captures.

### 2. Fake News Analysis
The News Verification system uses a powerful combination of **Local Language Models (LLMs)** and **Live Web Search** to rank article credibility.

*   **Hugging Face Neural Network:** The core text analysis runs locally via the Hugging Face `transformers` library using a finely-tuned RoBERTa or DistilBERT classification pipeline trained on millions of true and false news articles. It analyzes word relationships, semantic structure, and linguistic choices to predict if the article is synthetic or intentionally deceptive.
*   **Fact-Checking Cross-Reference:** The application scrapes the article for core "claims" using NLP tokenization, and then cross-references those claims against the **Google Fact Check API** (covering AFP, Reuters, Snopes, PolitiFact, etc.).
*   **Sentiment & Bias Analysis:** It runs a heuristic scoring loop checking for "red flag" language: sensationalism (e.g., "BOMBSHELL," "They're hiding this!"), clickbait structures, and extreme emotional bias.
*   **Sourcing Authority Check:** The analyzer checks the text for professional journalist conventions (e.g., "According to the AP," "A study published in," "Data shows") vs. vague attribution (e.g., "Many people are saying," "Look it up").

---

*Note: FAKIES serves as a forensic tool. While its AI engines are highly accurate, "INCONCLUSIVE" edge-cases should always be confirmed via manual human OSINT review.*
