// API per ripristinare i link iCal dal backup MongoDB
// File: src/app/api/admin/restore-ical-links/route.ts

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { collection, getDocs, doc, updateDoc, query, where } from "firebase/firestore";
import { db } from "~/lib/firebase/config";

export const dynamic = 'force-dynamic';

// Link iCal estratti da MongoDB
const ICAL_LINKS_BACKUP = [
  { name: "Brancaleone 86 - Loft", icalOktorate: "https://admin.octorate.com/cron/ICS/reservation/googlecal/954553_531554" },
  { name: "Brancaleone 86 - Garden", icalOktorate: "https://admin.octorate.com/cron/ICS/reservation/googlecal/768152_536969" },
  { name: "Lungotevere Testaccio 11", icalOktorate: "https://admin.octorate.com/cron/ICS/reservation/googlecal/597224_728835" },
  { name: "Giubbonari 74", icalOktorate: "https://admin.octorate.com/cron/ICS/reservation/googlecal/557211_536964" },
  { name: "Grotte 32", icalAirbnb: "https://www.airbnb.it/calendar/ical/5297331.ics?s=6d09c0f24a7800421f87e29b73044d40" },
  { name: "Atleta 23", icalOktorate: "https://admin.octorate.com/cron/ICS/reservation/googlecal/839515_728837" },
  { name: "Pellegrino 62", icalOktorate: "https://admin.octorate.com/cron/ICS/reservation/googlecal/221690_531549" },
  { name: "Gallo 24", icalOktorate: "https://admin.octorate.com/cron/ICS/reservation/googlecal/871607_603733" },
  { name: "Aubry 1", icalOktorate: "https://admin.octorate.com/cron/ICS/reservation/googlecal/790547_728836" },
  { name: "Rusconi 10", icalOktorate: "https://admin.octorate.com/cron/ICS/reservation/googlecal/450118_728832" },
  { name: "Angelico 70", icalOktorate: "https://admin.octorate.com/cron/ICS/reservation/googlecal/416016_728831" },
  { name: "Casa Beatriz", icalOktorate: "https://admin.octorate.com/cron/ICS/reservation/googlecal/489353_728833" },
  { name: "Gabri 19", icalOktorate: "https://admin.octorate.com/cron/ICS/reservation/googlecal/560609_728834" },
  { name: "Vicolo del Cinque 16", icalAirbnb: "https://www.airbnb.com/calendar/ical/32036289.ics?s=d2bbebb272c64d0378ab94a51337f122&locale=it" },
  { name: "Rome Town House", icalBooking: "https://ical.booking.com/v1/export?t=c5498e11-1c8e-4e84-a5b0-101a70f623fb" },
  { name: "Aurelia's hideaway", icalBooking: "https://ical.booking.com/v1/export?t=f4c70d81-c3f0-485f-a811-4b593816d2e1" },
  { name: "Apt Pantheon", icalAirbnb: "https://www.airbnb.it/calendar/ical/35171633.ics?s=96f2051f25e52e00384667104830bb9d" },
  { name: "LA CUPOLA APARTMENT", icalAirbnb: "https://www.airbnb.it/calendar/ical/1370452829602095129.ics?s=77a5b6ab8b24dd99491ea4fa81c8adab", icalBooking: "https://ical.booking.com/v1/export?t=60d5f68f-5964-4925-889e-cecbcbd7ee33" },
  { name: "Casa Galilei", icalAirbnb: "https://www.airbnb.com/calendar/ical/1119493107029537206.ics?s=f88d67f9bf0f05822e9ed1fc00dd8860&locale=it" },
  { name: "I colori di Baldo", icalAirbnb: "https://www.airbnb.it/calendar/ical/1320313756133795384.ics?s=b5e11043bb2f5b453e750a977d6f246c" },
  { name: "Arya di Roma Maison", icalAirbnb: "https://www.airbnb.it/calendar/ical/1305735625553108241.ics?s=51422bd85d2b3d64ef7bbb43f03701a5" },
  { name: "Imperial House San Calisto", icalAirbnb: "https://www.airbnb.com/calendar/ical/1184775813691763857.ics?s=af6dc403b3bd3e367d1987769255a647&locale=it", icalBooking: "https://ical.booking.com/v1/export?t=2576b527-10c1-425f-a927-1ca971e770fd" },
  { name: "Orso 80", icalOktorate: "https://www.italianway.house/apartments/11053/ical" },
  { name: "Poliziano 70", icalAirbnb: "https://www.airbnb.it/calendar/ical/1168768708755860947.ics?s=d9e128936d34757050779873ff539e03" },
  { name: "Serpenti 147", icalAirbnb: "https://www.airbnb.it/calendar/ical/37169991.ics?s=8096e7f93efc83a28427a81561a5889a" },
  { name: "Stanza 1", icalAirbnb: "https://www.airbnb.it/calendar/ical/44607508.ics?s=ac9f1015abe097e4626177f9f25ef9f4" },
  { name: "Stanza 2", icalAirbnb: "https://www.airbnb.it/calendar/ical/44833409.ics?s=a52362de04fb3eb833954dc70c9a871a" },
  { name: "Stanza 3", icalAirbnb: "https://www.airbnb.it/calendar/ical/45217172.ics?s=92b44747f841628d744ad5e53d80a12e" },
  { name: "Leopardi 17", icalKrossbooking: "https://ical.krossbooking.com/ical/g/shurapartments/527a233de1c75b54943c057d9e135aed.ics" },
  { name: "Milizie 140", icalOktorate: "https://ical.krossbooking.com/ical/g/hostin/3eb6481b09bd6e1cd46ceb7037a51954.ics" },
  { name: "Campo di Fiori Home", icalBooking: "https://ical.booking.com/v1/export?t=c395b1f3-17ac-4fc1-9693-54275a649a37", icalAirbnb: "https://www.airbnb.it/calendar/ical/1044001044595814624.ics?s=0190da00203672b5b45dd30b7d91572b" },
  { name: "The Aristocats Apartment", icalBooking: "https://ical.booking.com/v1/export?t=4c373174-e24f-4c28-bf46-902bbd3d1c32", icalAirbnb: "https://www.airbnb.it/calendar/ical/1167549352941934174.ics?s=ae2c3b4ea51eda4fed15305c96d608a8" },
  { name: "Casa Navona", icalOktorate: "https://www.italianway.house/apartments/13167" },
  { name: "Domus Vintage", icalAirbnb: "https://www.airbnb.it/calendar/ical/52157073.ics?s=4b9ad3d3ae1b95d757957169ec3f5aeb", icalBooking: "https://ical.booking.com/v1/export?t=6091b795-4745-4d14-b526-d08a3ab75a37" },
  { name: "Casale 2.0", icalAirbnb: "https://www.airbnb.it/calendar/ical/52016788.ics?s=9cb9b9b0f81b7647195c89957b22f9a9", icalBooking: "https://ical.booking.com/v1/export?t=b5720bc6-ea3a-4934-b732-1d1d42d47db8" },
  { name: "Gaia's Home in Vatican", icalInreception: "https://api.inreception.com/calendar/ical?accommodation=4601&room=25910" },
  { name: "Villa Borgese Apartment", icalAirbnb: "https://www.airbnb.it/calendar/ical/1160066554232661650.ics?s=4eaa4d5ef3684f3fb1d308ff2d73d826", icalBooking: "https://ical.booking.com/v1/export?t=a424d24f-9124-4099-93c3-4ead7495d163" },
  { name: "Stanza Grande", icalAirbnb: "https://www.airbnb.it/calendar/ical/50686713.ics?s=6e565bc6d20ba1dfdbdf62b57ac86158", icalBooking: "https://ical.booking.com/v1/export?t=74e55a0c-4b9f-4abd-9392-826c778701cf" },
  { name: "Stanza Piccola", icalAirbnb: "https://www.airbnb.it/calendar/ical/50686716.ics?s=69d46f09b362a88acb0f1b4b86e14b8f", icalBooking: "https://ical.booking.com/v1/export?t=1b8a5a40-0602-4846-90a5-55af8231e56a" },
  { name: "Melory House", icalAirbnb: "https://www.airbnb.it/calendar/ical/1037531707295466602.ics?s=b92b812c7e830f21e82b628d18992318", icalBooking: "https://ical.booking.com/v1/export?t=c432744f-4e5d-4343-80b0-4eb2b0e51f65" },
  { name: "Parione 44", icalAirbnb: "https://www.airbnb.it/calendar/ical/46914844.ics?s=85f203742f0f9803c85e32e58313c851", icalBooking: "https://ical.booking.com/v1/export?t=949d09c9-3257-451e-9d55-a464e4d01855" },
  { name: "Gallo 55", icalAirbnb: "https://www.airbnb.it/calendar/ical/1370284904700972977.ics?s=c0391b551f81b7bbf859c3e88f91b5b0", icalBooking: "https://ical.booking.com/v1/export?t=8d12ccf2-842c-44c7-88e2-f1076e3914c4" },
  { name: "Domus 50", icalBooking: "https://ical.booking.com/v1/export?t=f3f2be9e-692c-420d-8b89-bb9f5be35d7d" },
  { name: "Arco Suite 187", icalAirbnb: "https://www.airbnb.com/calendar/ical/1405855687455353455.ics?s=3fe8ab55a943ca11415469d63b3b3426&locale=it" },
  { name: "Appartamento Irnerio", icalKrossbooking: "https://ical.krossbooking.com/ical/g/agenziaguida/full_ce9cade1c33e3e563bc1b524971f578a.ics" },
  { name: "Vittoria's Home", icalAirbnb: "https://www.airbnb.com/calendar/ical/1277520383259355402.ics?s=c16c3c151fb75b8993d8de53f3a69d58&locale=it", icalBooking: "https://ical.booking.com/v1/export?t=e9f887c2-91f1-4d27-a361-b439bb4f1a19" },
  { name: "Boccea House", icalAirbnb: "https://www.airbnb.com/calendar/ical/1474813641707086263.ics?s=4501fd2139433b59381073f326be8946&locale=it" },
  { name: "P3 - Maison Leo a Largo Argentina", icalAirbnb: "https://www.airbnb.com/calendar/ical/1239958257449208611.ics?s=9d28878d800e5a1cd6f97f2c5114e47f&locale=it", icalBooking: "https://ical.booking.com/v1/export?t=46c86bd5-022f-45b8-bb9f-dc745dd08cff" },
  { name: "Maison Leo a S.M. Maggiore", icalAirbnb: "https://www.airbnb.com/calendar/ical/1091786696222300162.ics?s=5f2da1777f190dcc03a5fd0e35f31518&locale=it", icalBooking: "https://ical.booking.com/v1/export?t=5d0ce595-72cd-455a-9a42-e0784fb341c0" },
  { name: "Maison Leonardo al Pantheon", icalAirbnb: "https://www.airbnb.com/calendar/ical/603386879194261929.ics?s=1b6e4b35e5dd1801e17f29fd91a78e92&locale=it", icalBooking: "https://ical.booking.com/v1/export?t=3675e0b4-38fe-42ca-85d3-b1d01c7ac5ea" },
  { name: "Maison Leonardo al Colosseo", icalAirbnb: "https://www.airbnb.com/calendar/ical/947111505759614474.ics?s=c220b7cdd966c089058377e0f962f322&locale=it", icalBooking: "https://ical.booking.com/v1/export?t=22883137-cdeb-4c5d-9eba-1f818e2a3f5c" },
  { name: "Navona Campo de' Fiori Apartment", icalBooking: "https://ical.booking.com/v1/export?t=620e52af-e626-4aad-aeef-d61519d4d3cc", icalAirbnb: "https://www.airbnb.it/calendar/ical/1532053877772874325.ics?s=e1f8a4d6e0118cef22e3e1bc1dc3bcca" },
  { name: "P1 - THE RABBIT HOLE", icalBooking: "https://ical.booking.com/v1/export?t=8a0e88ac-7129-4f04-ba1c-d44398444518" },
  { name: "P2 - THE FOX COVE", icalBooking: "https://ical.booking.com/v1/export?t=4fefadac-8dd1-4f90-b083-1756dabbd3a5" },
  { name: "Pullino 72", icalAirbnb: "https://www.airbnb.com/calendar/ical/896315235029265247.ics?s=19e256d6c4b66c1c89e0e4af47615dbd&locale=it" },
  { name: "Cozy", icalAirbnb: "https://www.airbnb.com/calendar/ical/12504925.ics?s=da586849f75d4579005d4d17a07e5a9b&locale=it" },
  { name: "Pantheon Suite", icalAirbnb: "https://www.airbnb.com/calendar/ical/12616227.ics?s=ed997acb2154825f4b16c67750c04b99&locale=it" },
  { name: "Glossy", icalAirbnb: "https://www.airbnb.com/calendar/ical/12507976.ics?s=f1a4eada00d49bed91e779020b39d960&locale=it" },
  { name: "P4 - Rome Historic Centre Luxury Rooftop", icalAirbnb: "https://www.airbnb.com/calendar/ical/1554216043771673158.ics?s=22ebea34add5b3353c42c06168db23df&locale=it", icalBooking: "https://ical.booking.com/v1/export?t=7b30ad26-0b57-484f-bc90-c528efa2f872" },
  { name: "Serendipity", icalAirbnb: "https://www.airbnb.it/calendar/ical/1032489375683488104.ics?s=cb6050fcbd6d460a683c0019e111d8cd" },
  { name: "Poerio 1", icalAirbnb: "https://www.airbnb.it/calendar/ical/1357080082925793308.ics?t=57af2f7011c94ba6900ba1edf03269f3" },
  { name: "Poerio 2", icalAirbnb: "https://www.airbnb.it/calendar/ical/1564563256232386871.ics?t=bb782536707e4914a67514fa6ea9e723" },
];

async function getFirebaseUser() {
  try {
    const cookieStore = await cookies();
    const userCookie = cookieStore.get("firebase-user");
    if (userCookie) return JSON.parse(decodeURIComponent(userCookie.value));
    return null;
  } catch { return null; }
}

export async function POST() {
  const user = await getFirebaseUser();
  if (!user || (user.role !== 'ADMIN' && user.role !== 'admin')) {
    return NextResponse.json({ error: "Non autorizzato - Solo admin" }, { status: 401 });
  }

  try {
    // Carica tutte le proprietà da Firebase
    const propertiesSnap = await getDocs(collection(db, 'properties'));
    const firebaseProperties: { id: string; name: string }[] = [];
    
    propertiesSnap.forEach(doc => {
      const data = doc.data();
      firebaseProperties.push({ id: doc.id, name: data.name || '' });
    });
    
    console.log(`📋 Trovate ${firebaseProperties.length} proprietà su Firebase`);
    
    const results = {
      updated: [] as string[],
      notFound: [] as string[],
      errors: [] as string[],
    };
    
    // Per ogni link nel backup, cerca la proprietà corrispondente su Firebase
    for (const backup of ICAL_LINKS_BACKUP) {
      // Cerca per nome (case-insensitive, trim)
      const match = firebaseProperties.find(p => 
        p.name.toLowerCase().trim() === backup.name.toLowerCase().trim()
      );
      
      if (!match) {
        results.notFound.push(backup.name);
        console.log(`❌ Non trovata: ${backup.name}`);
        continue;
      }
      
      try {
        // Prepara i dati da aggiornare
        const updateData: Record<string, string> = {};
        if (backup.icalAirbnb) updateData.icalAirbnb = backup.icalAirbnb;
        if (backup.icalBooking) updateData.icalBooking = backup.icalBooking;
        if (backup.icalOktorate) updateData.icalOktorate = backup.icalOktorate;
        if (backup.icalInreception) updateData.icalInreception = backup.icalInreception;
        if (backup.icalKrossbooking) updateData.icalKrossbooking = backup.icalKrossbooking;
        
        // Aggiorna la proprietà
        await updateDoc(doc(db, 'properties', match.id), updateData);
        
        results.updated.push(backup.name);
        console.log(`✅ Aggiornata: ${backup.name}`);
      } catch (err) {
        results.errors.push(backup.name);
        console.error(`❌ Errore ${backup.name}:`, err);
      }
    }
    
    console.log('\n📊 RIEPILOGO:');
    console.log(`   ✅ Aggiornate: ${results.updated.length}`);
    console.log(`   ❌ Non trovate: ${results.notFound.length}`);
    console.log(`   ⚠️ Errori: ${results.errors.length}`);
    
    return NextResponse.json({
      success: true,
      results,
      summary: {
        updated: results.updated.length,
        notFound: results.notFound.length,
        errors: results.errors.length,
      }
    });
    
  } catch (error) {
    console.error('❌ Errore ripristino link:', error);
    return NextResponse.json({ error: "Errore durante il ripristino" }, { status: 500 });
  }
}

// GET per vedere il riepilogo senza modificare
export async function GET() {
  const user = await getFirebaseUser();
  if (!user || (user.role !== 'ADMIN' && user.role !== 'admin')) {
    return NextResponse.json({ error: "Non autorizzato - Solo admin" }, { status: 401 });
  }

  return NextResponse.json({
    message: "Usa POST per ripristinare i link iCal",
    totalLinks: ICAL_LINKS_BACKUP.length,
    properties: ICAL_LINKS_BACKUP.map(b => b.name),
  });
}
