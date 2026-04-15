#!/usr/bin/env node

/*
  Usage:
    1. Make sure you have Node.js installed.
    2. Save this script as split-models.js (or whatever name you prefer).
    3. Make it executable (on Unix-like systems): chmod +x split-models.js
    4. Run it and pass the source file path, e.g.:
         ./split-models.js path/to/combined-entities.ts
    5. It will output each entity in a separate file named e.g. tbl-all-customers.entity.ts
*/
console.log('ss');
const fs = require('fs');
const path = require('path');

// A small helper to convert PascalCase or snake_case to dashed-case
function toDashedCase(str) {
  // Remove any leading/trailing underscores/spaces
  str = str.trim().replace(/^_+|_+$/g, '');
  // Convert underscores to dashes
  str = str.replace(/_/g, '-');
  // Convert camel/pascal-case to dashed
  // Example: 'TblAllCustomers' -> 'tbl-all-customers'
  return str
    .replace(/([A-Z])/g, (match) => '-' + match.toLowerCase())
    .replace(/^-/, '');
}

// The path to the file that has all models (passed via command line arg)
const inputFile = process.argv[2];
if (!inputFile) {
  console.error('Please provide the path to the combined entities file.');
  process.exit(1);
}

// Read the entire file into memory
const content = fs.readFileSync(inputFile, 'utf8');

// We’ll split on the pattern "export class"
const segments = content.split(/(?=@Entity\(['"])/);

if (segments.length <= 1) {
  console.error('No "export class" patterns found. Check your input file.');
  process.exit(1);
}

// We might want to preserve the initial imports at the top of the file (if any)
// so let's capture everything before the first "export class"
let commonImports = '';
if (!segments[0].trim().startsWith('@Entity(')) {
  // The first segment might contain imports or comments
  commonImports = segments.shift(); // remove the first chunk of non-class code
}

// Ensure the directory for output exists (optional). 
// We'll output in the same directory as this script by default.
const outputDir = path.join(process.cwd(), 'split-output4');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir);
}

segments.forEach((segment) => {
  // Attempt to extract the class name
  // e.g. "export class TblAllCustomers {"
  const match = segment.match(/export\s+class\s+(\w+)/);
  if (!match) {
    console.error('Could not find class name in segment:', segment.slice(0, 100));
    return;
  }
  const className = match[1]; // e.g. "TblAllCustomers"

  // Convert that class name to dashed
  // e.g. "TblAllCustomers" -> "tbl-all-customers"
  const dashedName = toDashedCase(className);

  // Construct filename, e.g. "tbl-all-customers.entity.ts"
  const fileName = `${dashedName}.entity.ts`;

  // Reconstruct the file content:
  // 1) The common imports at the top (if any).
  // 2) The segment with the entity class.
  //    We assume the segment already includes `import { Entity, ... } from 'typeorm';`
  //    If not, you could add them from `commonImports`.
  let fileContent = "import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';\n";
  // If your `commonImports` contains relevant imports (like from 'typeorm'), you can prepend it.
  // But often each class segment already has `import ... from 'typeorm'` in it.
  // If you want to force them in, you can do something like:
  // fileContent += commonImports.trim() + "\n\n";
  fileContent += segment.trim() + '\n';

  // Write the new file
  const outputPath = path.join(outputDir, fileName);
  fs.writeFileSync(outputPath, fileContent, 'utf8');

  console.log(`Created: ${outputPath}`);
});

console.log('Done splitting models!');
