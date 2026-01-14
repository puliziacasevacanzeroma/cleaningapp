"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface User {
  id: string;
  name: string | null;
  email: string | null;
  phone?: string | null;
  role: string;
  createdAt: string;
}

interface UtentiClientProps {
  users: User[];
  role: "operator" | "owner" | "admin" | "rider";
  roleLabel: string;
  roleColor: string;
  roleBgColor: string;
}

export function UtentiClient({ users, role, roleLabel, roleColor, roleBgColor }: UtentiClientProps) {
  const router = useRouter();
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  
  // Form state
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    password: ""
  });

  const filteredUsers = users.filter(u => 
    u.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.email?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getInitials = (name: string | null) => {
    if (!name) return "??";
    return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      const response = await fetch("/api/dashboard/utenti", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          role
        })
      });

      if (response.ok) {
        setShowAddModal(false);
        setFormData({ name: "", email: "", phone: "", password: "" });
        router.refresh();
      } else {
        const error = await response.json();
        alert(error.message || "Errore durante la creazione");
      }
    } catch (error) {
      console.error("Errore:", error);
      alert("Errore durante la creazione");
    } finally {
      setLoading(false);
    }
  };

  const handleEditUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    setLoading(true);
    
    try {
      const response = await fetch(`/api/dashboard/utenti/${selectedUser.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData)
      });

      if (response.ok) {
        setShowEditModal(false);
        setSelectedUser(null);
        setFormData({ name: "", email: "", phone: "", password: "" });
        router.refresh();
      } else {
        const error = await response.json();
        alert(error.message || "Errore durante la modifica");
      }
    } catch (error) {
      console.error("Errore:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!confirm("Sei sicuro di voler eliminare questo utente?")) return;
    
    try {
      const response = await fetch(`/api/dashboard/utenti/${userId}`, {
        method: "DELETE"
      });

      if (response.ok) {
        router.refresh();
      }
    } catch (error) {
      console.error("Errore:", error);
    }
  };

  const openEditModal = (user: User) => {
    setSelectedUser(user);
    setFormData({
      name: user.name || "",
      email: user.email || "",
      phone: user.phone || "",
      password: ""
    });
    setShowEditModal(true);
  };

  const gradientColors: Record<string, string> = {
    operator: "from-emerald-400 to-teal-500",
    owner: "from-violet-400 to-purple-500",
    admin: "from-amber-400 to-orange-500",
    rider: "from-sky-400 to-blue-500"
  };

  return (
    <>
      <div className="p-8 overflow-x-hidden">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-slate-800">{roleLabel}</h1>
            <p className="text-slate-500">Gestisci gli utenti {roleLabel.toLowerCase()}</p>
          </div>
          <button 
            onClick={() => setShowAddModal(true)}
            className={`flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r ${gradientColors[role]} text-white rounded-xl shadow-lg hover:shadow-xl transition-all hover:-translate-y-0.5 font-medium`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Aggiungi {roleLabel.slice(0, -1)}
          </button>
        </div>

        {/* Search */}
        <div className="mb-6">
          <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-white border border-slate-200 shadow-sm w-full max-w-md">
            <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input 
              type="text" 
              placeholder="Cerca per nome o email..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-transparent border-none outline-none text-sm flex-1 placeholder:text-slate-400"
            />
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="bg-white rounded-2xl border border-slate-200/60 p-5">
            <p className="text-sm text-slate-500 mb-1">Totale {roleLabel}</p>
            <p className="text-2xl font-bold text-slate-800">{users.length}</p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200/60 p-5">
            <p className="text-sm text-slate-500 mb-1">Attivi oggi</p>
            <p className="text-2xl font-bold text-emerald-600">{users.length}</p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200/60 p-5">
            <p className="text-sm text-slate-500 mb-1">Nuovi questo mese</p>
            <p className="text-2xl font-bold text-sky-600">
              {users.filter(u => {
                const created = new Date(u.createdAt);
                const now = new Date();
                return created.getMonth() === now.getMonth() && created.getFullYear() === now.getFullYear();
              }).length}
            </p>
          </div>
        </div>

        {/* Users Grid */}
        {filteredUsers.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200/60 p-12 text-center">
            <div className={`w-16 h-16 rounded-2xl bg-gradient-to-r ${gradientColors[role]} opacity-20 flex items-center justify-center mx-auto mb-4`}>
              <svg className="w-8 h-8 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-slate-800 mb-2">Nessun {roleLabel.slice(0, -1).toLowerCase()} trovato</h3>
            <p className="text-slate-500 mb-6">Inizia aggiungendo il primo {roleLabel.slice(0, -1).toLowerCase()}</p>
            <button 
              onClick={() => setShowAddModal(true)}
              className={`inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r ${gradientColors[role]} text-white rounded-xl shadow-lg hover:shadow-xl transition-all font-medium`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Aggiungi {roleLabel.slice(0, -1)}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredUsers.map((user) => (
              <div 
                key={user.id}
                className="bg-white rounded-2xl border border-slate-200/60 p-5 hover:shadow-lg hover:-translate-y-1 transition-all group"
              >
                <div className="flex items-start gap-4">
                  <div className={`w-14 h-14 rounded-2xl bg-gradient-to-r ${gradientColors[role]} flex items-center justify-center shadow-lg`}>
                    <span className="text-lg font-bold text-white">{getInitials(user.name)}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-slate-800 truncate">{user.name || "Senza nome"}</h3>
                    <p className="text-sm text-slate-500 truncate">{user.email}</p>
                    {user.phone && (
                      <p className="text-sm text-slate-400 truncate">{user.phone}</p>
                    )}
                  </div>
                </div>
                
                <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-100">
                  <span className={`text-xs font-medium px-3 py-1 rounded-full ${roleBgColor} ${roleColor}`}>
                    {roleLabel.slice(0, -1)}
                  </span>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button 
                      onClick={() => openEditModal(user)}
                      className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                      title="Modifica"
                    >
                      <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                    </button>
                    <button 
                      onClick={() => handleDeleteUser(user.id)}
                      className="p-2 hover:bg-red-50 rounded-lg transition-colors"
                      title="Elimina"
                    >
                      <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal Aggiungi Utente */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className={`bg-gradient-to-r ${gradientColors[role]} px-6 py-4`}>
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold text-white">Nuovo {roleLabel.slice(0, -1)}</h3>
                  <p className="text-white/80 text-sm">Inserisci i dati del nuovo utente</p>
                </div>
                <button 
                  onClick={() => setShowAddModal(false)}
                  className="p-2 hover:bg-white/20 rounded-lg transition-colors"
                >
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            
            <form onSubmit={handleAddUser} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Nome completo *</label>
                <input 
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-sky-500 focus:border-transparent transition-all"
                  placeholder="Mario Rossi"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Email *</label>
                <input 
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-sky-500 focus:border-transparent transition-all"
                  placeholder="mario@esempio.com"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Telefono</label>
                <input 
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-sky-500 focus:border-transparent transition-all"
                  placeholder="+39 333 1234567"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Password *</label>
                <input 
                  type="password"
                  required
                  value={formData.password}
                  onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-sky-500 focus:border-transparent transition-all"
                  placeholder="••••••••"
                  minLength={6}
                />
                <p className="text-xs text-slate-400 mt-1">Minimo 6 caratteri</p>
              </div>
              
              <div className="flex gap-3 pt-4">
                <button 
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 transition-colors font-medium"
                >
                  Annulla
                </button>
                <button 
                  type="submit"
                  disabled={loading}
                  className={`flex-1 px-4 py-2.5 bg-gradient-to-r ${gradientColors[role]} text-white rounded-xl hover:shadow-lg transition-all font-medium disabled:opacity-50`}
                >
                  {loading ? "Creazione..." : "Crea utente"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Modifica Utente */}
      {showEditModal && selectedUser && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className={`bg-gradient-to-r ${gradientColors[role]} px-6 py-4`}>
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold text-white">Modifica {roleLabel.slice(0, -1)}</h3>
                  <p className="text-white/80 text-sm">{selectedUser.name}</p>
                </div>
                <button 
                  onClick={() => {
                    setShowEditModal(false);
                    setSelectedUser(null);
                  }}
                  className="p-2 hover:bg-white/20 rounded-lg transition-colors"
                >
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            
            <form onSubmit={handleEditUser} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Nome completo</label>
                <input 
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-sky-500 focus:border-transparent transition-all"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                <input 
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-sky-500 focus:border-transparent transition-all"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Telefono</label>
                <input 
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-sky-500 focus:border-transparent transition-all"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Nuova Password</label>
                <input 
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-sky-500 focus:border-transparent transition-all"
                  placeholder="Lascia vuoto per mantenere quella attuale"
                />
              </div>
              
              <div className="flex gap-3 pt-4">
                <button 
                  type="button"
                  onClick={() => {
                    setShowEditModal(false);
                    setSelectedUser(null);
                  }}
                  className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 transition-colors font-medium"
                >
                  Annulla
                </button>
                <button 
                  type="submit"
                  disabled={loading}
                  className={`flex-1 px-4 py-2.5 bg-gradient-to-r ${gradientColors[role]} text-white rounded-xl hover:shadow-lg transition-all font-medium disabled:opacity-50`}
                >
                  {loading ? "Salvataggio..." : "Salva modifiche"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
