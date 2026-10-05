import os
import subprocess
import markdown
import re

MD_FILE = r"d:\AuraAI_v1\explaination.md"
HTML_FILE = r"d:\AuraAI_v1\explaination.html"
PDF_FILE = r"d:\AuraAI_v1\explaination.pdf"
CHROME_PATH = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
if not os.path.exists(CHROME_PATH):
    CHROME_PATH = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"

with open(MD_FILE, "r", encoding="utf-8") as f:
    md_content = f.read()

# Convert markdown to HTML with rich extensions
html_body = markdown.markdown(
    md_content,
    extensions=["tables", "fenced_code", "toc", "attr_list", "def_list"]
)

# Custom post-processor: inspect <pre><code> blocks and add specific classes based on maximum line width
def adapt_code_blocks(match):
    full_pre = match.group(0)
    lines = full_pre.splitlines()
    max_len = max((len(l) for l in lines), default=0)
    
    if max_len > 95:
        # Extra-wide diagrams (e.g. End-to-End System Architecture with ~115 chars)
        return full_pre.replace('<pre>', '<pre class="pre-wide-xl">')
    elif max_len > 78:
        # Moderately wide code blocks (e.g. Directory trees with ~85 chars)
        return full_pre.replace('<pre>', '<pre class="pre-wide-md">')
    else:
        return full_pre

html_body = re.sub(r'<pre>(?:<code[^>]*>)?[\s\S]*?(?:</code>)?</pre>', adapt_code_blocks, html_body)

full_html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Aura AI 2.0 — Technical Explanation</title>
  <!-- KaTeX for math formulas -->
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css">
  <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js"></script>
  <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js"
          onload="renderMathInElement(document.body, {{
            delimiters: [
              {{left: '$$', right: '$$', display: true}},
              {{left: '$', right: '$', display: false}}
            ]
          }});"></script>
  <style>
    @page {{
      size: A4;
      margin: 14mm 12mm 16mm 12mm;
    }}
    *, *::before, *::after {{
      box-sizing: border-box;
    }}
    body {{
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      font-size: 13px;
      line-height: 1.55;
      color: #1e293b;
      margin: 0;
      padding: 0;
      background: #ffffff;
      width: 100%;
    }}
    h1 {{
      font-size: 23px;
      color: #0f172a;
      border-bottom: 2px solid #7c3aed;
      padding-bottom: 6px;
      margin-top: 22px;
      margin-bottom: 14px;
      page-break-after: avoid;
    }}
    h2 {{
      font-size: 18px;
      color: #1e1b4b;
      border-bottom: 1px solid #e2e8f0;
      padding-bottom: 5px;
      margin-top: 24px;
      margin-bottom: 12px;
      page-break-after: avoid;
    }}
    h3 {{
      font-size: 15px;
      color: #4338ca;
      margin-top: 18px;
      margin-bottom: 8px;
      page-break-after: avoid;
    }}
    h4 {{
      font-size: 13.5px;
      color: #334155;
      margin-top: 14px;
      margin-bottom: 6px;
      page-break-after: avoid;
    }}
    p, li {{
      color: #334155;
    }}
    ul, ol {{
      padding-left: 20px;
      margin-bottom: 10px;
    }}
    li {{
      margin-bottom: 3px;
    }}
    code {{
      font-family: Consolas, "Cascadia Code", "Courier New", monospace;
      font-size: 11.5px;
      background: #f1f5f9;
      color: #0f172a;
      padding: 1.5px 4.5px;
      border-radius: 4px;
      border: 1px solid #e2e8f0;
    }}
    pre {{
      background: #0f172a;
      color: #f8fafc;
      padding: 12px 14px;
      border-radius: 8px;
      overflow: hidden !important;
      font-family: Consolas, "Cascadia Code", "Courier New", monospace;
      font-size: 10.5px;
      line-height: 1.38;
      margin: 14px 0;
      page-break-inside: avoid;
      white-space: pre;
    }}
    pre.pre-wide-md {{
      font-size: 9px !important;
      line-height: 1.3 !important;
      padding: 10px 12px !important;
    }}
    pre.pre-wide-xl {{
      font-size: 7.6px !important;
      line-height: 1.23 !important;
      letter-spacing: -0.15px !important;
      padding: 12px 10px !important;
      border-radius: 6px;
    }}
    pre code {{
      background: transparent;
      color: inherit;
      padding: 0;
      border: none;
      font-size: inherit;
      font-family: inherit;
      white-space: pre;
    }}
    table {{
      width: 100%;
      border-collapse: collapse;
      margin: 14px 0;
      font-size: 12px;
      page-break-inside: avoid;
    }}
    th, td {{
      border: 1px solid #cbd5e1;
      padding: 6px 8px;
      text-align: left;
    }}
    th {{
      background: #f8fafc;
      color: #0f172a;
      font-weight: 700;
    }}
    tr:nth-child(even) {{
      background: #f8fafc;
    }}
    blockquote {{
      border-left: 4px solid #7c3aed;
      background: #f5f3ff;
      padding: 8px 14px;
      margin: 12px 0;
      border-radius: 0 8px 8px 0;
      color: #4c1d95;
    }}
    hr {{
      border: none;
      border-top: 1px solid #e2e8f0;
      margin: 20px 0;
    }}
    @media print {{
      body {{
        padding: 0;
      }}
      h1, h2, h3 {{
        page-break-after: avoid;
      }}
      pre, table, blockquote {{
        page-break-inside: avoid;
      }}
    }}
  </style>
</head>
<body>
{html_body}
</body>
</html>
"""

with open(HTML_FILE, "w", encoding="utf-8") as f:
    f.write(full_html)

print(f"Generated HTML: {HTML_FILE}")

# Use Headless Chrome to print to PDF
cmd = [
    CHROME_PATH,
    "--headless",
    "--disable-gpu",
    "--no-pdf-header-footer",
    "--run-all-compositor-stages-before-draw",
    f"--print-to-pdf={PDF_FILE}",
    HTML_FILE
]

print(f"Executing: {' '.join(cmd)}")
res = subprocess.run(cmd, capture_output=True, text=True)
if os.path.exists(PDF_FILE) and os.path.getsize(PDF_FILE) > 0:
    print(f"SUCCESS: PDF generated at {PDF_FILE} (Size: {os.path.getsize(PDF_FILE)} bytes)")
else:
    print(f"FAILED. Return code: {res.returncode}")
    print(f"STDOUT: {res.stdout}")
    print(f"STDERR: {res.stderr}")
