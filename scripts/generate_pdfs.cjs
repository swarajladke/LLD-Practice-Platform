const fs = require('fs');
const path = require('path');
const { mdToPdf } = require('C:/Users/Vicky/AppData/Roaming/npm/node_modules/md-to-pdf');

function countPdfPages(pdfBuffer) {
  const str = pdfBuffer.toString('binary');
  const matches = str.match(/\/Type\s*\/Page\b/g);
  return matches ? matches.length : 0;
}

const baseCss = `
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: #1f2328;
    line-height: 1.45;
  }
  h1 {
    font-size: 17pt;
    margin-top: 0;
    margin-bottom: 8px;
    border-bottom: 2px solid #0969da;
    padding-bottom: 4px;
    color: #0969da;
  }
  h2 {
    font-size: 12.5pt;
    margin-top: 14px;
    margin-bottom: 6px;
    color: #1f2328;
    border-bottom: 1px solid #d8dee4;
    padding-bottom: 3px;
  }
  h3 {
    font-size: 10.5pt;
    margin-top: 10px;
    margin-bottom: 4px;
    color: #24292f;
  }
  p, ul, ol {
    margin-top: 3px;
    margin-bottom: 6px;
  }
  li {
    margin-bottom: 2px;
  }
  tr, li {
    break-inside: avoid;
    page-break-inside: avoid;
  }
  table {
    border-collapse: collapse;
    width: 100%;
    margin: 8px 0;
    font-size: 8pt;
    line-height: 1.3;
    page-break-inside: auto;
  }
  th, td {
    border: 1px solid #d0d7de;
    padding: 5px 7px;
    text-align: left;
    vertical-align: top;
  }
  th {
    background-color: #f6f8fa;
    font-weight: 600;
  }
  blockquote {
    margin: 6px 0;
    padding: 4px 10px;
    border-left: 3px solid #0969da;
    background-color: #f6f8fa;
    color: #57606a;
    font-style: italic;
  }
  pre, code {
    font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;
    font-size: 8.5pt;
  }
  pre {
    background-color: #f6f8fa;
    border: 1px solid #d0d7de;
    border-radius: 4px;
    padding: 8px 10px;
    overflow-x: auto;
    margin: 6px 0;
  }
  img {
    max-width: 100%;
    height: auto;
    display: block;
    margin: 10px auto;
  }
`;

async function main() {
  const rootDir = path.resolve(__dirname, '..');
  const submissionDir = path.resolve(rootDir, 'submission');
  const scratchDir = path.resolve(rootDir, 'scratch');

  if (!fs.existsSync(submissionDir)) fs.mkdirSync(submissionDir, { recursive: true });
  if (!fs.existsSync(scratchDir)) fs.mkdirSync(scratchDir, { recursive: true });

  const results = [];

  // ==========================================
  // 1. Research Note (A4 LANDSCAPE, 9pt body, <= 2 pages)
  // ==========================================
  console.log('--- Generating Research Note PDF ---');
  const researchNotePath = path.resolve(rootDir, 'docs/RESEARCH_NOTE.md');
  const researchDest = path.resolve(submissionDir, 'Research_Note_Swaraj_Ladke.pdf');

  await mdToPdf(
    { path: researchNotePath },
    {
      dest: researchDest,
      pdf_options: {
        format: 'A4',
        landscape: true,
        margin: {
          top: '9mm',
          right: '11mm',
          bottom: '9mm',
          left: '11mm',
        },
        printBackground: true,
      },
      css: `
        body {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          font-size: 9pt;
          line-height: 1.35;
          color: #1f2328;
        }
        h1 {
          font-size: 15pt;
          margin-top: 0;
          margin-bottom: 5px;
          border-bottom: 1.5px solid #0969da;
          padding-bottom: 2px;
          color: #0969da;
        }
        h2 {
          font-size: 10.5pt;
          margin-top: 7px;
          margin-bottom: 3px;
          color: #1f2328;
          border-bottom: 1px solid #eaeef2;
          padding-bottom: 2px;
        }
        p, ul, ol {
          margin-top: 2px;
          margin-bottom: 4px;
        }
        li {
          margin-bottom: 2px;
        }
        tr, li {
          break-inside: avoid;
          page-break-inside: avoid;
        }
        table {
          border-collapse: collapse;
          width: 100%;
          margin: 4px 0;
          font-size: 7.6pt;
          line-height: 1.25;
          page-break-inside: auto;
        }
        th, td {
          border: 1px solid #d0d7de;
          padding: 4px 5px;
          text-align: left;
          vertical-align: top;
        }
        th {
          background-color: #f6f8fa;
          font-weight: 600;
          color: #24292f;
        }
        blockquote {
          margin: 3px 0;
          padding: 2px 8px;
          border-left: 3px solid #0969da;
          background-color: #f6f8fa;
          color: #57606a;
          font-size: 7.8pt;
        }
        ol {
          padding-left: 18px;
        }
      `,
    }
  );

  const resBuf = fs.readFileSync(researchDest);
  const resPages = countPdfPages(resBuf);
  results.push({
    file: 'Research_Note_Swaraj_Ladke.pdf',
    pages: resPages,
    bytes: resBuf.length,
    path: researchDest,
  });
  console.log(`Saved Research Note: ${resPages} pages, ${resBuf.length} bytes`);

  // ==========================================
  // 2. Design Note (A4 portrait, dedicated landscape page for Class Diagram)
  // ==========================================
  console.log('--- Generating Design Note PDF ---');
  let designMd = fs.readFileSync(path.resolve(rootDir, 'docs/DESIGN.md'), 'utf-8');

  // Wrap Section 3 in a landscape container for the PDF
  const section3Regex = /(## 3\. Class Diagram[\s\S]*?!\[.*?\]\(assets\/class-diagram\.png\))/;
  designMd = designMd.replace(
    section3Regex,
    '<div class="class-diagram-landscape-page">\n\n$1\n\n</div>'
  );

  const processedDesignPath = path.resolve(scratchDir, 'DESIGN_PROCESSED.md');
  fs.writeFileSync(processedDesignPath, designMd, 'utf-8');

  // Copy assets next to processed markdown so relative image paths work seamlessly
  const scratchAssetsDir = path.resolve(scratchDir, 'assets');
  if (!fs.existsSync(scratchAssetsDir)) fs.mkdirSync(scratchAssetsDir, { recursive: true });
  fs.copyFileSync(path.resolve(rootDir, 'docs/assets/user-flow.png'), path.resolve(scratchAssetsDir, 'user-flow.png'));
  fs.copyFileSync(path.resolve(rootDir, 'docs/assets/class-diagram.png'), path.resolve(scratchAssetsDir, 'class-diagram.png'));
  fs.copyFileSync(path.resolve(rootDir, 'docs/assets/state-machine.png'), path.resolve(scratchAssetsDir, 'state-machine.png'));

  const designDest = path.resolve(submissionDir, 'Design_Note_Swaraj_Ladke.pdf');

  await mdToPdf(
    { path: processedDesignPath },
    {
      dest: designDest,
      pdf_options: {
        format: 'A4',
        landscape: false,
        margin: {
          top: '12mm',
          right: '12mm',
          bottom: '12mm',
          left: '12mm',
        },
        printBackground: true,
      },
      css: `
        ${baseCss}

        @page landscape-section {
          size: A4 landscape;
          margin: 10mm;
        }

        .class-diagram-landscape-page {
          page: landscape-section;
          break-before: page;
          break-after: page;
          page-break-before: always;
          page-break-after: always;
          text-align: center;
        }

        .class-diagram-landscape-page h2 {
          text-align: left;
          margin-bottom: 8px;
        }

        .class-diagram-landscape-page img {
          width: 100%;
          max-width: 100%;
          max-height: 172mm;
          object-fit: contain;
          margin: 0 auto;
          border: 1px solid #d0d7de;
          border-radius: 4px;
        }

        /* Portrait user flow image */
        img[src*="user-flow.png"] {
          max-width: 90%;
          max-height: 140px;
          object-fit: contain;
          margin: 8px auto;
          border: 1px solid #d0d7de;
          border-radius: 4px;
        }

        /* Portrait state machine image */
        img[src*="state-machine.png"] {
          max-width: 70%;
          max-height: 260px;
          object-fit: contain;
          margin: 8px auto;
          border: 1px solid #d0d7de;
          border-radius: 4px;
        }
      `,
    }
  );

  const desBuf = fs.readFileSync(designDest);
  const desPages = countPdfPages(desBuf);
  results.push({
    file: 'Design_Note_Swaraj_Ladke.pdf',
    pages: desPages,
    bytes: desBuf.length,
    path: designDest,
  });
  console.log(`Saved Design Note: ${desPages} pages, ${desBuf.length} bytes`);

  // ==========================================
  // 3. README and AI_USAGE (A4 portrait, page break between them)
  // ==========================================
  console.log('--- Generating README and AI_USAGE PDF ---');
  const readmeContent = fs.readFileSync(path.resolve(rootDir, 'README.md'), 'utf-8');
  const aiUsageContent = fs.readFileSync(path.resolve(rootDir, 'AI_USAGE.md'), 'utf-8');

  // Concatenate with an explicit page break
  const combinedMarkdown = `${readmeContent}\n\n<div style="page-break-after: always; break-after: page;"></div>\n\n${aiUsageContent}`;
  const combinedPath = path.resolve(scratchDir, 'README_and_AI_USAGE.md');
  fs.writeFileSync(combinedPath, combinedMarkdown, 'utf-8');

  const combinedDest = path.resolve(submissionDir, 'README_and_AI_USAGE_Swaraj_Ladke.pdf');

  await mdToPdf(
    { path: combinedPath },
    {
      dest: combinedDest,
      pdf_options: {
        format: 'A4',
        landscape: false,
        margin: {
          top: '12mm',
          right: '12mm',
          bottom: '12mm',
          left: '12mm',
        },
        printBackground: true,
      },
      css: baseCss,
    }
  );

  const comBuf = fs.readFileSync(combinedDest);
  const comPages = countPdfPages(comBuf);
  results.push({
    file: 'README_and_AI_USAGE_Swaraj_Ladke.pdf',
    pages: comPages,
    bytes: comBuf.length,
    path: combinedDest,
  });
  console.log(`Saved README and AI_USAGE: ${comPages} pages, ${comBuf.length} bytes`);

  console.log('\n=== SUMMARY ===');
  console.table(results.map(r => ({
    File: r.file,
    Pages: r.pages,
    Size_KB: (r.bytes / 1024).toFixed(1) + ' KB',
  })));
}

main().catch(err => {
  console.error('Fatal error generating PDFs:', err);
  process.exit(1);
});
