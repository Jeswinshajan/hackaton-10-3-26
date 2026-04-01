# FAKIES (Deepfake & AI Content Forensic Analysis System)

## Problem Statement
With the rapid advancement of AI technologies like deepfakes and generative models, it has become increasingly difficult to distinguish between real and fake media. Misinformation, fake news, and AI-generated images/videos are spreading quickly across social media and digital platforms, leading to serious consequences such as public manipulation, fraud, and loss of trust.

FAKIES aims to solve this problem by providing a reliable system that can detect AI-generated images and analyze news content for authenticity using forensic and AI-based techniques.

## Project Description
FAKIES is an OSINT-based cyber forensic application designed to detect synthetic media and verify the authenticity of textual content.

The system works using a multi-layered detection approach:

🔍 Image & Deepfake Detection
Performs pixel-level analysis to identify AI-generated patterns.
Uses facial geometry heuristics to detect inconsistencies in human features.
Applies texture and frequency analysis to find hidden AI artifacts.
Detects unnatural edge blending and ghosting effects.
Analyzes EXIF metadata to identify tampering.
📰 Fake News Detection
Uses NLP-based neural networks to classify news as real or fake.
Extracts claims and cross-verifies them using fact-checking APIs.
Performs sentiment and bias analysis to detect manipulation.
Evaluates source credibility and journalistic standards.
💡 Key Features
Detects AI-generated images (GANs, Diffusion models)
Identifies misleading or fake news articles
Combines AI + heuristic + OSINT techniques
Provides confidence-based results (Real / Fake / Inconclusive
---

## Google AI Usage
Tools / Models Used
Google Fact Check Tools API
Google Gemini
### Tools / Models Used
Google AI technologies are integrated into FAKIES to enhance accuracy and reliability:

Google Fact Check API is used to cross-reference extracted claims from news articles with trusted fact-checking organizations like AFP, Reuters, and PolitiFact.
Google Gemini API is used for advanced natural language understanding, helping in:
Claim extraction
Semantic analysis
Context understanding of news content

This integration ensures real-time verification and improves the credibility scoring of analyzed content.
-

## Screenshots 
Add project screenshots:
<img width="1920" height="1080" alt="Screenshot 2026-04-01 065606" src="https://github.com/user-attachments/assets/b75ec51e-6184-427d-ad2e-4461f2918ab6" />
<img width="1920" height="1080" alt="Screenshot 2026-04-01 065523" src="https://github.com/user-attachments/assets/c4ae9c0e-2642-411c-ab64-dfb6e2db3472" />

---

## Demo Video
Upload your demo video to Google Drive and paste the shareable link here(max 3 minutes).


https://drive.google.com/file/d/1w3i1Klk1aSr9KT0u6G6P4eFEqjGV2Xzd/view?usp=drive_link
---

## Installation Steps

```bash
# Clone the repository
git clone <your-repo-link>

# Go to project folder
cd project-name

# Install dependencies
npm install

# Run the project
npm start
