const fs=require('fs');  
let c=fs.readFileSync('src/components/dashboard/CreaProprietaModal.tsx','utf8');  
c=c.replace("if (!hasLetti) return 'Aggiungi almeno un letto'; return null;", "if (!hasLetti) return 'Aggiungi almeno un letto'; const totPosti = allBeds.reduce((s, b) => s + b.capacita, 0); if (totPosti < formData.maxGuests) return 'Posti insufficienti: ' + totPosti + ' posti per ' + formData.maxGuests + ' ospiti'; return null;");  
fs.writeFileSync('src/components/dashboard/CreaProprietaModal.tsx',c);  
