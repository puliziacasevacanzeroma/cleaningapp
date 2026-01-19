"use client";

import { useEffect, useState } from "react";
import { useAuth } from "~/lib/firebase/AuthContext";
import { useRouter, useParams } from "next/navigation";
import { getPropertyById } from "~/lib/firebase/firestore-data";
import PropertyServiceConfig from "~/components/dashboard/PropertyServiceConfig";

export default function ProprietaDetailPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string;
  
  const [property, setProperty] = useState<any>(null);
  const [dataLoading, setDataLoading] = useState(true);

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    }
  }, [user, loading, router]);

  useEffect(() => {
    async function loadProperty() {
      if (!id || !user) return;
      
      try {
        const prop = await getPropertyById(id);
        
        if (!prop) {
          router.push("/proprietario/proprieta");
          return;
        }
        
        // Verifica che sia del proprietario (o admin)
        if (prop.ownerId !== user.id && user.role?.toUpperCase() !== "ADMIN") {
          router.push("/proprietario/proprieta");
          return;
        }
        
        setProperty(prop);
      } catch (error) {
        console.error("Errore caricamento proprietà:", error);
        router.push("/proprietario/proprieta");
      } finally {
        setDataLoading(false);
      }
    }
    
    if (user) loadProperty();
  }, [id, user, router]);

  if (loading || dataLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-500"></div>
      </div>
    );
  }

  if (!user || !property) return null;

  return (
    <PropertyServiceConfig 
      isAdmin={false} 
      propertyId={property.id}
      initialImageUrl={property.imageUrl}
    />
  );
}