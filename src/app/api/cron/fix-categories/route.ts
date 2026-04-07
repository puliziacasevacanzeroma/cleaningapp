import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "~/lib/firebase/admin";
export const dynamic = "force-dynamic";
const CRON_SECRET = process.env.CRON_SECRET;

const CATEGORY_RULES: Array<{ match: (name: string, key: string) => boolean; categoryId: string }> = [
  { match: (n) => n.includes('copripiumin') || n.includes('duvet'), categoryId: 'biancheria_letto' },
  { match: (n, k) => n.includes('lenzuol') || k.includes('sheet') || k.includes('lenz'), categoryId: 'biancheria_letto' },
  { match: (n, k) => n.includes('feder') || k.includes('pillow'), categoryId: 'biancheria_letto' },
  { match: (n) => n.includes('canavaccio'), categoryId: 'biancheria_letto' },
  { match: (n) => n.includes('telo doccia') || n.includes('asciugaman') || n.includes('tappetino'), categoryId: 'biancheria_bagno' },
  { match: (n) => n.includes('shampoo') || n.includes('bagnoschiuma') || n.includes('saponetta') || n.includes('doccia-shampoo'), categoryId: 'kit_cortesia' },
  { match: (n) => n.includes('disincrostante') || n.includes('vetril') || n.includes('aceto') || n.includes('acido') || n.includes('lavapavimenti') || n.includes('mocio') || n.includes('stracci') || n.includes('panni') || n.includes('spugna') || n.includes('buste') || n.includes('disgorgante') || n.includes('profumo spray'), categoryId: 'prodotti_pulizia' },
  { match: (n) => n.includes('prosecco') || n.includes('welcome'), categoryId: 'servizi_extra' },
];

export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get("secret") !== CRON_SECRET) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const execute = req.nextUrl.searchParams.get("execute") === "true";

  const snap = await adminDb.collection("inventory").get();
  const toFix: Array<{ docId: string; name: string; currentCat: string; newCat: string }> = [];

  for (const doc of snap.docs) {
    const data = doc.data();
    const name = (data.name || '').toLowerCase();
    const key = (data.key || '').toLowerCase();
    const currentCat = data.categoryId || 'altro';
    if (currentCat !== 'altro' && currentCat !== doc.id && !currentCat.includes('copripiumino')) continue;
    for (const rule of CATEGORY_RULES) {
      if (rule.match(name, key)) {
        if (currentCat !== rule.categoryId) {
          toFix.push({ docId: doc.id, name: data.name, currentCat, newCat: rule.categoryId });
        }
        break;
      }
    }
  }

  if (execute) {
    for (const fix of toFix) {
      await adminDb.collection("inventory").doc(fix.docId).update({ categoryId: fix.newCat });
    }
  }

  return NextResponse.json({ mode: execute ? "EXECUTE" : "DRY RUN", toFix, count: toFix.length });
}
