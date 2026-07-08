// ALWAYS LOAD ENVIRONMENT VARIABLES FIRST!

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { put } = require('@vercel/blob');

const LOCAL_FILES_DIR = path.join(__dirname, 'Files'); 
const OUTPUT_JSON_PATH = path.join(__dirname, 'blob-map.json');

// Recursive function to search all subfolders for PDF files
function getPdfFilesRecursively(dir, fileList = []) {
    const items = fs.readdirSync(dir);
    
    for (const item of items) {
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory()) {
            getPdfFilesRecursively(fullPath, fileList);
        } else if (item.endsWith('.pdf') || item.endsWith('.PDF')) {
            fileList.push({
                fileName: item,
                absolutePath: fullPath
            });
        }
    }
    return fileList;
}

async function uploadAllPdfs() {
    try {
        console.log('Scanning directories recursively for PDFs...');
        const pdfFiles = getPdfFilesRecursively(LOCAL_FILES_DIR);
        console.log(`Found ${pdfFiles.length} local PDF file(s) across your folders.`);
        
        // 1. LOAD THE EXISTING BLOB-MAP CACHE (IF IT EXISTS)
        let urlMap = {};
        if (fs.existsSync(OUTPUT_JSON_PATH)) {
            try {
                urlMap = JSON.parse(fs.readFileSync(OUTPUT_JSON_PATH, 'utf8'));
                console.log(`Loaded existing map with ${Object.keys(urlMap).length} cached files.`);
            } catch (parseError) {
                console.log('Could not parse existing blob-map.json, starting a fresh map.');
            }
        }

        let uploadCount = 0;
        let skipCount = 0;

        // 2. LOOP THROUGH ALL GATHERED PDF PATHS
        for (const fileInfo of pdfFiles) {
            const fileName = fileInfo.fileName;

            // CHECK: If this file name is already inside our JSON map, skip the upload!
            if (urlMap[fileName]) {
                console.log(`Skipping (Already Uploaded): ${fileName}`);
                skipCount++;
                continue; 
            }

            // Otherwise, proceed to upload
            const fileBuffer = fs.readFileSync(fileInfo.absolutePath);
            console.log(`Uploading: ${fileName}`);
            
            const blob = await put(fileInfo.fileName, fileBuffer, {
                access: 'public',
                addRandomSuffix: true,
                token: process.env.BLOB_READ_WRITE_TOKEN
            });

            // Add the new file mapping to our map
            urlMap[fileName] = blob.url;
            uploadCount++;
            console.log(`Uploaded successfully! URL: ${blob.url}\n`);
        }

        // 3. WRITE THE COMBINED CACHE BACK TO THE JSON FILE
        fs.writeFileSync(OUTPUT_JSON_PATH, JSON.stringify(urlMap, null, 2));
        console.log(`\n--- Execution Summary ---`);
        console.log(`Skipped: ${skipCount} file(s)`);
        console.log(`Uploaded: ${uploadCount} new file(s)`);
        console.log(`Total active URLs mapped: ${Object.keys(urlMap).length}`);
        console.log(`Updated mapping file saved at: ${OUTPUT_JSON_PATH}`);
    } catch (error) {
        console.error('Error during recursive upload pipeline:', error);
    }
}

uploadAllPdfs();