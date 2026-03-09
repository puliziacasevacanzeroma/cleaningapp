# CleaningApp - Gestionale Pulizie

## Stack Tecnologico

- **Framework**: Next.js 15 (App Router)
- **Database**: Firebase Firestore
- **Auth**: Firebase Auth + JWT custom middleware
- **Storage**: Firebase Storage
- **Styling**: Tailwind CSS
- **Language**: TypeScript
- **Email**: Resend
- **Push**: Firebase Cloud Messaging (FCM)

## Architettura

### Ruoli
- **Admin**: gestione completa (pulizie, proprietà, utenti, ordini, report)
- **Proprietario**: gestione proprietà, calendario, saldo
- **Operatore**: esecuzione pulizie, foto, segnalazioni
- **Rider**: consegne biancheria

### API Routes
Le API routes usano **Firebase Admin SDK** (`~/lib/firebase/admin`) per tutte le operazioni server-side.
I componenti frontend usano il **Firebase Client SDK** (`~/lib/firebase/config`) per operazioni real-time.

### File condivisi
- `src/lib/firebase/firestore-data.ts` → funzioni CRUD (Client SDK, usato dal frontend)
- `src/lib/firebase/firestore-data-admin.ts` → funzioni CRUD (Admin SDK, usato dalle API)
- `src/lib/firebase/notifications.ts` → notifiche (Client SDK, usato dal frontend)
- `src/lib/firebase/notifications-admin.ts` → notifiche (Admin SDK, usato dalle API)

## Setup

### 1. Installa dipendenze
```bash
npm install
```

### 2. Configura variabili ambiente
Copia `.env.example` in `.env.local` e compila tutti i valori.

### 3. Avvia il progetto
```bash
npm run dev
```

## Indici Firestore
Vedi `INDICI_FIRESTORE_NECESSARI.txt` e `firestore.indexes.json` per gli indici compositi necessari.
