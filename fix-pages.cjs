const fs = require('fs');
const path = require('path');

const filesToFix = [
  'src/app/dashboard/ordini/[id]/page.tsx',
  'src/app/dashboard/proprieta/[id]/page.tsx',
  'src/app/dashboard/proprietari/[id]/page.tsx',
  'src/app/operatore/pulizie/[id]/page.tsx',
  'src/app/proprietario/proprieta/[id]/modifica/page.tsx',
  'src/app/proprietario/proprieta/[id]/page.tsx'
];

filesToFix.forEach(file => {
  const fullPath = path.join(__dirname, file);
  if (!fs.existsSync(fullPath)) {
    console.log('Not found:', file);
    return;
  }
  
  let content = fs.readFileSync(fullPath, 'utf8');
  
  if (content.includes('params: { id: string }') && !content.includes('Promise<{ id: string }>')) {
    // Step 1: Change params type
    content = content.replace(
      /params\s*\}:\s*\{\s*params:\s*\{\s*id:\s*string\s*\}\s*\}/g,
      'params }: { params: Promise<{ id: string }> }'
    );
    
    // Step 2: Add await params after redirect or first auth check
    if (!content.includes('await params')) {
      content = content.replace(
        /(if\s*\(!session\)\s*redirect\s*\([^)]+\);)/,
        '$1\n\n  const { id } = await params;'
      );
    }
    
    // Step 3: Replace params.id with id
    content = content.replace(/params\.id/g, 'id');
    
    fs.writeFileSync(fullPath, content, 'utf8');
    console.log('Fixed:', file);
  } else {
    console.log('Already fixed or different format:', file);
  }
});

console.log('Done!');