const fs = require('fs');
const path = require('path');

function fixFile(filePath) {
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Controlla se ha params: { id: string } (vecchio formato)
    if (content.includes('params: { id: string }') && !content.includes('params: Promise<{ id: string }>')) {
      // Sostituisci il tipo dei params
      content = content.replace(/params: \{ id: string \}/g, 'params: Promise<{ id: string }>');
      
      // Aggiungi "const { id } = await params;" dopo la prima riga che usa params
      // Solo se non c'è già
      if (!content.includes('const { id } = await params')) {
        // Trova dove aggiungere l'await params
        content = content.replace(
          /(const session = await auth\(\);[\s\S]*?if \(!session[^}]*\}[\s\n]*)/g,
          '$1\n    const { id } = await params;\n'
        );
      }
      
      // Sostituisci params.id con id
      content = content.replace(/params\.id/g, 'id');
      
      fs.writeFileSync(filePath, content, 'utf8');
      console.log('Fixed:', filePath);
      return true;
    }
    return false;
  } catch (err) {
    console.error('Error:', filePath, err.message);
    return false;
  }
}

function walkDir(dir) {
  const files = fs.readdirSync(dir);
  let count = 0;
  
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      count += walkDir(filePath);
    } else if (file.endsWith('.ts') && filePath.includes('[')) {
      if (fixFile(filePath)) count++;
    }
  }
  return count;
}

const apiDir = path.join(__dirname, 'src', 'app', 'api');
const fixed = walkDir(apiDir);
console.log(`\nTotal fixed: ${fixed} files`);