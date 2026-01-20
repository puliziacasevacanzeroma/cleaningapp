# CleaningApp - Gestionale Pulizie

## Istruzioni di Installazione

### 1. Copia i file nel tuo progetto T3

Copia questi file nella cartella del tuo progetto `cleaningappnpx`:

- `.env` → nella root del progetto
- `prisma/schema.prisma` → sostituisce quello esistente
- `src/app/login/page.tsx` → crea la cartella login e il file
- `src/app/dashboard/` → copia tutta la cartella
- `src/components/Sidebar.tsx` → crea la cartella components e il file
- `src/server/auth/config.ts` → sostituisce quello esistente

### 2. Installa le dipendenze

```bash
npm install bcryptjs
npm install -D @types/bcryptjs
```

### 3. Genera Prisma e sincronizza il database

```bash
npx prisma generate
npx prisma db push
```

### 4. Avvia il progetto

```bash
npm run dev
```

### 5. Apri nel browser

Vai a http://localhost:3000/login

## Credenziali di Test

- Email: damianiariele@gmail.com
- Password: (la tua password)

## Struttura del Progetto

```
src/
├── app/
│   ├── login/
│   │   └── page.tsx
│   └── dashboard/
│       ├── layout.tsx
│       ├── page.tsx
│       ├── calendario-prenotazioni/
│       ├── calendario-pulizie/
│       ├── proprieta/
│       ├── operatori/
│       ├── report/
│       └── impostazioni/
├── components/
│   └── Sidebar.tsx
└── server/
    └── auth/
        └── config.ts
```

## Funzionalità

- ✅ Login con credenziali
- ✅ Dashboard con statistiche
- ✅ Calendario Prenotazioni (Gantt)
- ✅ Calendario Pulizie (Gantt)
- ✅ Gestione Proprietà
- ✅ Gestione Operatori
- ✅ Report e Statistiche
- ✅ Impostazioni Profilo
 
