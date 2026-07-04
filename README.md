# Product Photo Free Pro AI

This ZIP has two parts:

1. `huggingface-space-backend`
   - Upload these files to a Hugging Face Space.
   - Choose Docker Space.
   - After deploy, your API endpoint will be:
     `https://YOUR-SPACE.hf.space/process`

2. `github-pages-frontend`
   - Upload these files to GitHub Pages.
   - Paste your Hugging Face `/process` URL in the website input.

Features:
- Advanced BiRefNet background remover
- rembg fallback
- white background
- enhance controls
- 400x400 JPG
- target 190-199KB under 200KB
- custom filename

Note:
Hugging Face free CPU can be slow on first request. GPU gives better speed but may not be free.
