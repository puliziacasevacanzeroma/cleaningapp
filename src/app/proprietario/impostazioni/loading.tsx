export default function Loading() {
  return (
    <div className="p-6 flex items-center justify-center min-h-[400px]">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-sky-500 mx-auto mb-4" />
        <p className="text-gray-500">Caricamento impostazioni...</p>
      </div>
    </div>
  );
}
