"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

interface User {
  id: string;
  name: string | null;
  surname?: string | null;
  email: string | null;
  phone?: string | null;
  role: string;
  status: string;
  createdAt?: any;
  updatedAt?: any;
  suspendedAt?: any;
  suspendedReason?: string | null;
  properties?: number;
  completedJobs?: number;
  deliveries?: number;
}

const roleConfig: Record<string, {
  label: string;
  plural: string;
  gradient: string;
  lightGradient: string;
  border: string;
  text: string;
  bg: string;
  icon: string;
  stat: string;
}> = {
  ADMIN: {
    label: 'Admin',
    plural: 'Amministratori',
    gradient: 'from-slate-600 to-slate-800',
    lightGradient: 'from-slate-100 to-slate-200',
    border: 'border-slate-300',
    text: 'text-slate-700',
    bg: 'bg-slate-100',
    icon: '👑',
    stat: 'Sistema'
  },
  PROPRIETARIO: {
    label: 'Proprietario',
    plural: 'Proprietari',
    gradient: 'from-indigo-500 to-violet-600',
    lightGradient: 'from-indigo-50 to-violet-100',
    border: 'border-indigo-200',
    text: 'text-indigo-700',
    bg: 'bg-indigo-50',
    icon: '🏠',
    stat: 'Proprietà'
  },
  CLIENTE: {
    label: 'Proprietario',
    plural: 'Proprietari',
    gradient: 'from-indigo-500 to-violet-600',
    lightGradient: 'from-indigo-50 to-violet-100',
    border: 'border-indigo-200',
    text: 'text-indigo-700',
    bg: 'bg-indigo-50',
    icon: '🏠',
    stat: 'Proprietà'
  },
  OPERATORE_PULIZIE: {
    label: 'Operatore',
    plural: 'Operatori',
    gradient: 'from-teal-500 to-cyan-600',
    lightGradient: 'from-teal-50 to-cyan-100',
    border: 'border-teal-200',
    text: 'text-teal-700',
    bg: 'bg-teal-50',
    icon: '✨',
    stat: 'Lavori'
  },
  RIDER: {
    label: 'Rider',
    plural: 'Riders',
    gradient: 'from-blue-500 to-sky-600',
    lightGradient: 'from-blue-50 to-sky-100',
    border: 'border-blue-200',
    text: 'text-blue-700',
    bg: 'bg-blue-50',
    icon: '🚴',
    stat: 'Consegne'
  },
};

export function UtentiView() {
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  
  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showSuspendModal, setShowSuspendModal] = useState(false);
  const [showReactivateModal, setShowReactivateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  
  // Action states
  const [userToAction, setUserToAction] = useState<User | null>(null);
  const [suspendReason, setSuspendReason] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedRole, setSelectedRole] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  
  // Form state
  const [formData, setFormData] = useState({
    name: '',
    surname: '',
    email: '',
    phone: '',
    password: ''
  });
  const [useGeneratedPassword, setUseGeneratedPassword] = useState(true);
  const [generatedPassword, setGeneratedPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Genera password casuale
  const generatePassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%';
    let password = '';
    for (let i = 0; i < 10; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  };

  // Fetch users
  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/dashboard/utenti');
      const data = await res.json();
      if (data.users) {
        setUsers(data.users);
      }
    } catch (error) {
      console.error('Errore fetch utenti:', error);
    } finally {
      setLoading(false);
    }
  };

  // Stats
  const stats = {
    ALL: users.length,
    ACTIVE: users.filter(u => u.status === 'ACTIVE').length,
    SUSPENDED: users.filter(u => u.status === 'SUSPENDED').length,
    ADMIN: users.filter(u => u.role === 'ADMIN').length,
    PROPRIETARIO: users.filter(u => u.role === 'PROPRIETARIO' || u.role === 'CLIENTE').length,
    OPERATORE_PULIZIE: users.filter(u => u.role === 'OPERATORE_PULIZIE').length,
    RIDER: users.filter(u => u.role === 'RIDER').length,
  };

  // Filtered users
  const filteredUsers = users.filter(u => {
    if (activeTab === 'SUSPENDED' && u.status !== 'SUSPENDED') return false;
    if (activeTab === 'PROPRIETARIO' && u.role !== 'PROPRIETARIO' && u.role !== 'CLIENTE') return false;
    if (activeTab !== 'ALL' && activeTab !== 'SUSPENDED' && activeTab !== 'PROPRIETARIO' && u.role !== activeTab) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q) || u.phone?.includes(q);
    }
    return true;
  });

  const getInitials = (name: string | null) => {
    if (!name) return '??';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const getUserStat = (user: User) => {
    if (user.role === 'PROPRIETARIO') return user.properties || 0;
    if (user.role === 'OPERATORE_PULIZIE') return user.completedJobs || 0;
    if (user.role === 'RIDER') return user.deliveries || 0;
    return '∞';
  };

  const formatDate = (date: any) => {
    if (!date) return '-';
    try {
      const d = date.toDate ? date.toDate() : new Date(date);
      return d.toLocaleDateString('it-IT');
    } catch {
      return '-';
    }
  };

  // === HANDLERS ===
  
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRole) return;
    
    const passwordToUse = useGeneratedPassword ? generatedPassword : formData.password;
    
    if (!passwordToUse || passwordToUse.length < 6) {
      alert('La password deve essere di almeno 6 caratteri');
      return;
    }
    
    setIsProcessing(true);
    try {
      const res = await fetch('/api/dashboard/utenti', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          surname: formData.surname,
          email: formData.email,
          phone: formData.phone,
          role: selectedRole,
          password: passwordToUse,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        setShowAddModal(false);
        setFormData({ name: '', surname: '', email: '', phone: '', password: '' });
        setSelectedRole(null);
        setGeneratedPassword('');
        setSuccessMessage(data.emailSent 
          ? `✅ Utente creato! Email con credenziali inviata a ${formData.email}`
          : `✅ Utente creato! ${data.emailError ? `(Email non inviata: ${data.emailError})` : ''}`
        );
        fetchUsers();
        setTimeout(() => setSuccessMessage(null), 5000);
      } else {
        alert(data.error || 'Errore durante la creazione');
      }
    } catch (error) {
      console.error('Errore:', error);
      alert('Errore durante la creazione');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSuspend = async () => {
    if (!userToAction || !suspendReason.trim()) return;
    
    setIsProcessing(true);
    try {
      const res = await fetch(`/api/dashboard/utenti/${userToAction.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'suspend',
          suspendedReason: suspendReason,
        }),
      });

      if (res.ok) {
        setShowSuspendModal(false);
        setUserToAction(null);
        setSuspendReason('');
        setSelectedUser(null);
        setSuccessMessage('✅ Utente sospeso con successo');
        fetchUsers();
        setTimeout(() => setSuccessMessage(null), 3000);
      }
    } catch (error) {
      console.error('Errore:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReactivate = async () => {
    if (!userToAction) return;
    
    setIsProcessing(true);
    try {
      const res = await fetch(`/api/dashboard/utenti/${userToAction.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reactivate' }),
      });

      if (res.ok) {
        setShowReactivateModal(false);
        setUserToAction(null);
        setSelectedUser(null);
        setSuccessMessage('✅ Utente riattivato con successo');
        fetchUsers();
        setTimeout(() => setSuccessMessage(null), 3000);
      }
    } catch (error) {
      console.error('Errore:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDelete = async () => {
    if (!userToAction) return;
    
    setIsProcessing(true);
    try {
      const res = await fetch(`/api/dashboard/utenti/${userToAction.id}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        setShowDeleteModal(false);
        setUserToAction(null);
        setSelectedUser(null);
        setSuccessMessage('✅ Utente eliminato con successo');
        fetchUsers();
        setTimeout(() => setSuccessMessage(null), 3000);
      } else {
        const data = await res.json();
        alert(data.error || 'Errore durante l\'eliminazione');
      }
    } catch (error) {
      console.error('Errore:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleEditUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userToAction) return;
    
    setIsProcessing(true);
    try {
      const res = await fetch(`/api/dashboard/utenti/${userToAction.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          surname: formData.surname,
          email: formData.email,
          phone: formData.phone,
          ...(formData.password && { password: formData.password }),
        }),
      });

      if (res.ok) {
        setShowEditModal(false);
        setUserToAction(null);
        setFormData({ name: '', surname: '', email: '', phone: '', password: '' });
        setSuccessMessage('✅ Utente modificato con successo');
        fetchUsers();
        setTimeout(() => setSuccessMessage(null), 3000);
      }
    } catch (error) {
      console.error('Errore:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const openEditModal = (user: User) => {
    setUserToAction(user);
    setFormData({
      name: user.name || '',
      surname: user.surname || '',
      email: user.email || '',
      phone: user.phone || '',
      password: '',
    });
    setShowEditModal(true);
  };

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600">Caricamento utenti...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50">
      {/* Success Message */}
      {successMessage && (
        <div className="fixed top-4 right-4 z-50 bg-emerald-500 text-white px-6 py-3 rounded-xl shadow-lg animate-fade-in">
          {successMessage}
        </div>
      )}

      {/* Header */}
      <div className="bg-white/80 backdrop-blur-xl border-b border-slate-200 px-4 md:px-8 py-4 sticky top-0 z-30">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Gestione Team</h1>
            <p className="text-slate-500 text-sm">
              <span className="text-emerald-600 font-medium">{stats.ACTIVE} attivi</span>
              {stats.SUSPENDED > 0 && (
                <span className="text-amber-600 font-medium ml-2">• {stats.SUSPENDED} sospesi</span>
              )}
            </p>
          </div>
          <button
            onClick={() => {
              const newPassword = generatePassword();
              setGeneratedPassword(newPassword);
              setFormData(prev => ({ ...prev, password: newPassword }));
              setUseGeneratedPassword(true);
              setShowAddModal(true);
            }}
            className="px-4 py-2.5 bg-gradient-to-r from-indigo-600 to-violet-600 rounded-xl text-white text-sm font-semibold shadow-lg shadow-indigo-500/25 hover:shadow-xl transition-all flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            <span className="hidden sm:inline">Nuovo Utente</span>
          </button>
        </div>

        {/* Search */}
        <div className="relative mb-4">
          <svg className="w-5 h-5 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Cerca per nome, email o telefono..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-12 pr-4 py-3 bg-slate-100 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all"
          />
        </div>

        {/* Category Grid 2x2 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3 mb-3">
          {['ADMIN', 'PROPRIETARIO', 'OPERATORE_PULIZIE', 'RIDER'].map((role) => {
            const config = roleConfig[role];
            const isActive = activeTab === role;
            const suspendedCount = users.filter(u => 
              (role === 'PROPRIETARIO' ? (u.role === 'PROPRIETARIO' || u.role === 'CLIENTE') : u.role === role) 
              && u.status === 'SUSPENDED'
            ).length;
            return (
              <button
                key={role}
                onClick={() => setActiveTab(isActive ? 'ALL' : role)}
                className={`relative rounded-2xl p-3 md:p-4 text-left transition-all duration-300 ${
                  isActive
                    ? `bg-gradient-to-br ${config.gradient} shadow-lg`
                    : `bg-gradient-to-br ${config.lightGradient} border ${config.border} hover:shadow-md`
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xl md:text-2xl">{config.icon}</span>
                    <p className={`text-xs font-medium mt-1 ${isActive ? 'text-white' : config.text}`}>
                      {config.plural}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className={`text-xl md:text-2xl font-bold ${isActive ? 'text-white' : 'text-slate-800'}`}>
                      {stats[role as keyof typeof stats]}
                    </span>
                    {suspendedCount > 0 && (
                      <p className={`text-xs ${isActive ? 'text-white/70' : 'text-amber-600'}`}>
                        {suspendedCount} sosp.
                      </p>
                    )}
                  </div>
                </div>
                {isActive && (
                  <div className="absolute top-2 right-2 w-2 h-2 bg-white rounded-full animate-pulse" />
                )}
              </button>
            );
          })}
        </div>

        {/* Suspended Filter */}
        {stats.SUSPENDED > 0 && (
          <button
            onClick={() => setActiveTab(activeTab === 'SUSPENDED' ? 'ALL' : 'SUSPENDED')}
            className={`w-full py-2.5 rounded-xl font-medium text-sm flex items-center justify-center gap-2 transition-all ${
              activeTab === 'SUSPENDED'
                ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-lg'
                : 'bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100'
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            Utenti Sospesi ({stats.SUSPENDED})
          </button>
        )}
      </div>

      {/* User List */}
      <div className="p-4 md:p-8 space-y-3">
        {activeTab !== 'ALL' && activeTab !== 'SUSPENDED' && (
          <button
            onClick={() => setActiveTab('ALL')}
            className="w-full py-2 text-sm text-slate-500 bg-white rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors"
          >
            ✕ Mostra tutti gli utenti
          </button>
        )}

        {filteredUsers.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 text-center border border-slate-200 shadow-sm">
            <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <span className="text-3xl">🔍</span>
            </div>
            <p className="text-slate-600 font-medium">Nessun utente trovato</p>
            <p className="text-slate-400 text-sm mt-1">Prova con altri termini di ricerca</p>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {filteredUsers.map((user) => {
              const config = roleConfig[user.role] || roleConfig.ADMIN;
              const isSuspended = user.status === 'SUSPENDED';
              return (
                <div
                  key={user.id}
                  onClick={() => setSelectedUser(user)}
                  className={`group bg-white rounded-2xl border overflow-hidden cursor-pointer transition-all duration-300 hover:shadow-lg ${
                    isSuspended ? 'border-amber-300 bg-amber-50/30' : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className={`h-1.5 bg-gradient-to-r ${isSuspended ? 'from-amber-400 to-orange-500' : config.gradient}`} />

                  {isSuspended && (
                    <div className="mx-4 mt-3 px-3 py-1.5 bg-amber-100 border border-amber-200 rounded-lg inline-flex items-center gap-2">
                      <span className="text-amber-700 text-xs font-semibold">⚠️ SOSPESO</span>
                    </div>
                  )}

                  <div className="p-4">
                    <div className="flex items-start gap-4">
                      <div className="relative flex-shrink-0">
                        <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${config.gradient} flex items-center justify-center shadow-lg ${isSuspended ? 'opacity-60' : ''}`}>
                          <span className="text-white font-bold text-lg">{getInitials(user.name)}</span>
                        </div>
                        <div className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-full border-2 border-white ${isSuspended ? 'bg-amber-500' : 'bg-emerald-500'} flex items-center justify-center shadow-sm`}>
                          {isSuspended ? (
                            <span className="text-white text-xs">✕</span>
                          ) : (
                            <span className="text-white text-xs">✓</span>
                          )}
                        </div>
                      </div>

                      <div className="flex-1 min-w-0">
                        <h3 className={`font-semibold truncate ${isSuspended ? 'text-slate-500' : 'text-slate-800'}`}>
                          {user.name || 'Senza nome'}
                        </h3>
                        <p className="text-slate-400 text-sm truncate">{user.email}</p>
                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                          <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium ${config.bg} ${config.text} border ${config.border}`}>
                            {config.icon} {config.label}
                          </span>
                          <span className="text-slate-400 text-xs">
                            • {getUserStat(user)} {config.stat.toLowerCase()}
                          </span>
                        </div>
                        {isSuspended && user.suspendedReason && (
                          <p className="text-amber-600 text-xs mt-2 truncate">
                            💬 {user.suspendedReason}
                          </p>
                        )}
                      </div>

                      <div className="flex flex-col gap-1.5">
                        {isSuspended ? (
                          <button
                            onClick={(e) => { e.stopPropagation(); setUserToAction(user); setShowReactivateModal(true); }}
                            className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 text-white text-xs font-medium shadow-sm hover:shadow-md hover:scale-105 transition-all"
                            title="Riattiva"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <span className="hidden sm:inline">Riattiva</span>
                          </button>
                        ) : (
                          <button
                            onClick={(e) => { e.stopPropagation(); setUserToAction(user); setShowSuspendModal(true); }}
                            className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 text-white text-xs font-medium shadow-sm hover:shadow-md hover:scale-105 transition-all"
                            title="Sospendi"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25v13.5m-7.5-13.5v13.5" />
                            </svg>
                            <span className="hidden sm:inline">Sospendi</span>
                          </button>
                        )}
                        <button
                          onClick={(e) => { e.stopPropagation(); setUserToAction(user); setShowDeleteModal(true); }}
                          className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-red-500 to-rose-500 text-white text-xs font-medium shadow-sm hover:shadow-md hover:scale-105 transition-all"
                          title="Elimina"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                          </svg>
                          <span className="hidden sm:inline">Elimina</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ====== ADD USER MODAL ====== */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => !isProcessing && setShowAddModal(false)} />
          <div className="relative bg-white rounded-t-3xl md:rounded-2xl w-full max-w-lg max-h-[90vh] overflow-auto shadow-2xl">
            <div className="sticky top-0 bg-gradient-to-r from-indigo-600 to-violet-600 p-5 z-10">
              <div className="w-10 h-1 bg-white/30 rounded-full mx-auto mb-3 md:hidden" />
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-white">Nuovo Utente</h2>
                  <p className="text-indigo-200 text-sm">Verrà inviata email con credenziali</p>
                </div>
                <button onClick={() => setShowAddModal(false)} className="p-2 hover:bg-white/20 rounded-lg transition-colors">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            
            <form onSubmit={handleCreateUser} className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-3">Seleziona ruolo *</label>
                <div className="grid grid-cols-2 gap-2">
                  {['ADMIN', 'PROPRIETARIO', 'OPERATORE_PULIZIE', 'RIDER'].map((role) => {
                    const config = roleConfig[role];
                    return (
                    <button
                      key={role}
                      type="button"
                      onClick={() => setSelectedRole(role)}
                      className={`p-4 rounded-xl text-left transition-all ${
                        selectedRole === role
                          ? `bg-gradient-to-br ${config.gradient} shadow-lg`
                          : `bg-gradient-to-br ${config.lightGradient} border ${config.border} hover:shadow-md`
                      }`}
                    >
                      <span className="text-2xl">{config.icon}</span>
                      <p className={`font-semibold text-sm mt-2 ${selectedRole === role ? 'text-white' : config.text}`}>
                        {config.label}
                      </p>
                    </button>
                  )})}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Nome completo *</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="mario@esempio.com"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Telefono</label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="+39 333 1234567"
                />
              </div>

              {/* Password Section */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="block text-sm font-medium text-slate-700">Password *</label>
                  <button
                    type="button"
                    onClick={() => {
                      const newPwd = generatePassword();
                      setGeneratedPassword(newPwd);
                      if (useGeneratedPassword) {
                        setFormData(prev => ({ ...prev, password: newPwd }));
                      }
                    }}
                    className="text-xs text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1"
                  >
                    🔄 Rigenera
                  </button>
                </div>
                
                {/* Toggle */}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setUseGeneratedPassword(true);
                      setFormData(prev => ({ ...prev, password: generatedPassword }));
                    }}
                    className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
                      useGeneratedPassword
                        ? 'bg-indigo-100 text-indigo-700 border-2 border-indigo-500'
                        : 'bg-slate-100 text-slate-600 border-2 border-transparent hover:bg-slate-200'
                    }`}
                  >
                    🎲 Usa generata
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setUseGeneratedPassword(false);
                      setFormData(prev => ({ ...prev, password: '' }));
                    }}
                    className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
                      !useGeneratedPassword
                        ? 'bg-indigo-100 text-indigo-700 border-2 border-indigo-500'
                        : 'bg-slate-100 text-slate-600 border-2 border-transparent hover:bg-slate-200'
                    }`}
                  >
                    ✏️ Personalizzata
                  </button>
                </div>

                {/* Password Input */}
                {useGeneratedPassword ? (
                  <div className="relative">
                    <div className="flex items-center gap-2 px-4 py-3 bg-emerald-50 border-2 border-emerald-200 rounded-xl">
                      <span className="text-emerald-600">🔐</span>
                      <code className={`flex-1 font-mono text-lg font-semibold ${showPassword ? 'text-emerald-800' : 'text-emerald-800'}`}>
                        {showPassword ? generatedPassword : '••••••••••'}
                      </code>
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="p-1.5 hover:bg-emerald-100 rounded-lg transition-colors"
                      >
                        {showPassword ? (
                          <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                          </svg>
                        ) : (
                          <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(generatedPassword);
                          setSuccessMessage('📋 Password copiata!');
                          setTimeout(() => setSuccessMessage(null), 2000);
                        }}
                        className="p-1.5 hover:bg-emerald-100 rounded-lg transition-colors"
                        title="Copia password"
                      >
                        <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                      </button>
                    </div>
                    <p className="text-xs text-emerald-600 mt-1">✨ Password sicura generata automaticamente</p>
                  </div>
                ) : (
                  <div>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={formData.password}
                        onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                        className="w-full px-4 py-3 pr-12 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        placeholder="Inserisci password personalizzata"
                        minLength={6}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 hover:bg-slate-100 rounded-lg transition-colors"
                      >
                        {showPassword ? (
                          <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                          </svg>
                        ) : (
                          <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                        )}
                      </button>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">Minimo 6 caratteri</p>
                  </div>
                )}
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                <p className="text-blue-800 text-sm">
                  📧 La password verrà generata automaticamente e inviata all'email dell'utente.
                </p>
              </div>

              <div className="flex gap-3 pt-2 pb-4">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  disabled={isProcessing}
                  className="flex-1 py-3.5 rounded-xl border border-slate-200 text-slate-600 font-medium hover:bg-slate-50 transition-colors disabled:opacity-50"
                >
                  Annulla
                </button>
                <button
                  type="submit"
                  disabled={isProcessing || !selectedRole}
                  className={`flex-1 py-3.5 rounded-xl font-medium transition-all disabled:opacity-50 ${
                    selectedRole
                      ? `bg-gradient-to-r ${roleConfig[selectedRole].gradient} text-white shadow-lg`
                      : 'bg-slate-100 text-slate-400'
                  }`}
                >
                  {isProcessing ? '⏳ Creazione...' : '✅ Crea Utente'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ====== SUSPEND MODAL ====== */}
      {showSuspendModal && userToAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => !isProcessing && setShowSuspendModal(false)} />
          <div className="relative bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="bg-gradient-to-r from-amber-500 to-orange-500 p-5">
              <h3 className="text-xl font-bold text-white">⏸️ Sospendi Utente</h3>
              <p className="text-white/80 text-sm">L'utente non potrà più accedere</p>
            </div>
            <div className="p-5">
              <div className="bg-slate-50 rounded-xl p-4 mb-4 border flex items-center gap-3">
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${roleConfig[userToAction.role]?.gradient || 'from-slate-500 to-slate-600'} flex items-center justify-center`}>
                  <span className="text-white font-bold">{getInitials(userToAction.name)}</span>
                </div>
                <div>
                  <p className="font-semibold text-slate-800">{userToAction.name}</p>
                  <p className="text-slate-500 text-sm">{userToAction.email}</p>
                </div>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
                <p className="text-amber-800 text-sm">⚠️ L'utente non potrà accedere finché non verrà riattivato</p>
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-700 mb-2">Motivo sospensione *</label>
                <textarea
                  value={suspendReason}
                  onChange={(e) => setSuspendReason(e.target.value)}
                  placeholder="Es: Pagamento in sospeso, Assenze ripetute..."
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-amber-500"
                  rows={3}
                />
              </div>
              <div className="flex gap-3">
                <button onClick={() => setShowSuspendModal(false)} disabled={isProcessing} className="flex-1 py-3 rounded-xl border border-slate-200 text-slate-600 font-medium disabled:opacity-50">
                  Annulla
                </button>
                <button onClick={handleSuspend} disabled={isProcessing || !suspendReason.trim()} className="flex-1 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-medium disabled:opacity-50">
                  {isProcessing ? '⏳ Attendere...' : '⏸️ Sospendi'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ====== REACTIVATE MODAL ====== */}
      {showReactivateModal && userToAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => !isProcessing && setShowReactivateModal(false)} />
          <div className="relative bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="bg-gradient-to-r from-emerald-500 to-teal-500 p-5">
              <h3 className="text-xl font-bold text-white">✅ Riattiva Utente</h3>
              <p className="text-white/80 text-sm">Ripristina l'accesso all'account</p>
            </div>
            <div className="p-5">
              <div className="bg-slate-50 rounded-xl p-4 mb-4 border flex items-center gap-3">
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${roleConfig[userToAction.role]?.gradient || 'from-slate-500 to-slate-600'} flex items-center justify-center`}>
                  <span className="text-white font-bold">{getInitials(userToAction.name)}</span>
                </div>
                <div>
                  <p className="font-semibold text-slate-800">{userToAction.name}</p>
                  <p className="text-slate-500 text-sm">{userToAction.email}</p>
                </div>
              </div>
              {userToAction.suspendedReason && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
                  <p className="text-amber-800 text-sm"><strong>Motivo sospensione:</strong> {userToAction.suspendedReason}</p>
                </div>
              )}
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mb-4">
                <p className="text-emerald-800 text-sm">✅ L'utente potrà accedere nuovamente</p>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setShowReactivateModal(false)} disabled={isProcessing} className="flex-1 py-3 rounded-xl border border-slate-200 text-slate-600 font-medium disabled:opacity-50">
                  Annulla
                </button>
                <button onClick={handleReactivate} disabled={isProcessing} className="flex-1 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-medium disabled:opacity-50">
                  {isProcessing ? '⏳ Attendere...' : '✅ Riattiva'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ====== DELETE MODAL ====== */}
      {showDeleteModal && userToAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => !isProcessing && setShowDeleteModal(false)} />
          <div className="relative bg-white rounded-2xl w-full max-w-md shadow-2xl p-6">
            <div className="text-center">
              <div className="w-20 h-20 bg-gradient-to-br from-red-500 to-rose-600 rounded-3xl flex items-center justify-center mx-auto mb-4 shadow-lg">
                <span className="text-4xl">🗑️</span>
              </div>
              <h3 className="text-xl font-bold text-slate-800 mb-2">Elimina Utente</h3>
              <div className="bg-slate-50 rounded-xl p-3 mb-4 inline-flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${roleConfig[userToAction.role]?.gradient || 'from-slate-500 to-slate-600'} flex items-center justify-center`}>
                  <span className="text-white font-bold text-sm">{getInitials(userToAction.name)}</span>
                </div>
                <div className="text-left">
                  <p className="font-medium text-slate-800">{userToAction.name}</p>
                  <p className="text-slate-500 text-sm">{userToAction.email}</p>
                </div>
              </div>
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
                <p className="text-red-700 text-sm">⚠️ Questa azione è <strong>irreversibile</strong>. Tutti i dati verranno eliminati.</p>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setShowDeleteModal(false)} disabled={isProcessing} className="flex-1 py-3 rounded-xl border border-slate-200 text-slate-600 font-medium disabled:opacity-50">
                  Annulla
                </button>
                <button onClick={handleDelete} disabled={isProcessing} className="flex-1 py-3 rounded-xl bg-gradient-to-r from-red-500 to-rose-600 text-white font-medium disabled:opacity-50">
                  {isProcessing ? '⏳ Attendere...' : '🗑️ Elimina'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ====== USER DETAIL MODAL ====== */}
      {selectedUser && !showDeleteModal && !showSuspendModal && !showReactivateModal && !showEditModal && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setSelectedUser(null)} />
          <div className="relative bg-white rounded-t-3xl md:rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl">
            <div className={`bg-gradient-to-br ${roleConfig[selectedUser.role]?.gradient || 'from-slate-500 to-slate-600'} p-6`}>
              <div className="w-10 h-1 bg-white/30 rounded-full mx-auto mb-4 md:hidden" />
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-2xl bg-white/20 flex items-center justify-center">
                  <span className="text-2xl font-bold text-white">{getInitials(selectedUser.name)}</span>
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-bold text-white">{selectedUser.name}</h2>
                    {selectedUser.status === 'SUSPENDED' && (
                      <span className="px-2 py-0.5 bg-white/20 rounded-full text-xs text-white">Sospeso</span>
                    )}
                  </div>
                  <p className="text-white/80 text-sm">
                    {roleConfig[selectedUser.role]?.icon} {roleConfig[selectedUser.role]?.label}
                  </p>
                </div>
                <button onClick={() => setSelectedUser(null)} className="p-2 hover:bg-white/20 rounded-lg transition-colors">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="p-6 space-y-4">
              {selectedUser.status === 'SUSPENDED' && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                  <p className="font-medium text-amber-800">⚠️ Account Sospeso</p>
                  {selectedUser.suspendedReason && (
                    <p className="text-amber-700 text-sm mt-1">{selectedUser.suspendedReason}</p>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-50 rounded-xl p-4 border">
                  <p className="text-xs text-slate-500 mb-1">📧 Email</p>
                  <p className="text-sm font-medium text-slate-800 truncate">{selectedUser.email}</p>
                </div>
                <div className="bg-slate-50 rounded-xl p-4 border">
                  <p className="text-xs text-slate-500 mb-1">📱 Telefono</p>
                  <p className="text-sm font-medium text-slate-800">{selectedUser.phone || '-'}</p>
                </div>
                <div className="bg-slate-50 rounded-xl p-4 border">
                  <p className="text-xs text-slate-500 mb-1">📊 {roleConfig[selectedUser.role]?.stat}</p>
                  <p className="text-sm font-medium text-slate-800">{getUserStat(selectedUser)}</p>
                </div>
                <div className="bg-slate-50 rounded-xl p-4 border">
                  <p className="text-xs text-slate-500 mb-1">📅 Registrato</p>
                  <p className="text-sm font-medium text-slate-800">{formatDate(selectedUser.createdAt)}</p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <button
                  onClick={() => { setUserToAction(selectedUser); openEditModal(selectedUser); setSelectedUser(null); }}
                  className="py-3 rounded-xl bg-slate-100 text-slate-700 font-medium text-sm hover:bg-slate-200 transition-colors"
                >
                  ✏️ Modifica
                </button>
                {selectedUser.status === 'SUSPENDED' ? (
                  <button
                    onClick={() => { setUserToAction(selectedUser); setShowReactivateModal(true); setSelectedUser(null); }}
                    className="py-3 rounded-xl bg-emerald-50 text-emerald-600 font-medium text-sm border border-emerald-200 hover:bg-emerald-100 transition-colors"
                  >
                    ✅ Riattiva
                  </button>
                ) : (
                  <button
                    onClick={() => { setUserToAction(selectedUser); setShowSuspendModal(true); setSelectedUser(null); }}
                    className="py-3 rounded-xl bg-amber-50 text-amber-600 font-medium text-sm border border-amber-200 hover:bg-amber-100 transition-colors"
                  >
                    ⏸️ Sospendi
                  </button>
                )}
                <button
                  onClick={() => { setUserToAction(selectedUser); setShowDeleteModal(true); setSelectedUser(null); }}
                  className="py-3 rounded-xl bg-red-50 text-red-600 font-medium text-sm border border-red-200 hover:bg-red-100 transition-colors"
                >
                  🗑️ Elimina
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ====== EDIT USER MODAL ====== */}
      {showEditModal && userToAction && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => !isProcessing && setShowEditModal(false)} />
          <div className="relative bg-white rounded-t-3xl md:rounded-2xl w-full max-w-lg max-h-[90vh] overflow-auto shadow-2xl">
            <div className={`sticky top-0 bg-gradient-to-r ${roleConfig[userToAction.role]?.gradient || 'from-slate-500 to-slate-600'} p-5 z-10`}>
              <div className="w-10 h-1 bg-white/30 rounded-full mx-auto mb-3 md:hidden" />
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-white">Modifica Utente</h2>
                  <p className="text-white/80 text-sm">{userToAction.name}</p>
                </div>
                <button onClick={() => setShowEditModal(false)} className="p-2 hover:bg-white/20 rounded-lg transition-colors">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            
            <form onSubmit={handleEditUser} className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Nome completo</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Telefono</label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Nuova Password</label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Lascia vuoto per mantenere quella attuale"
                />
              </div>

              <div className="flex gap-3 pt-2 pb-4">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  disabled={isProcessing}
                  className="flex-1 py-3.5 rounded-xl border border-slate-200 text-slate-600 font-medium hover:bg-slate-50 transition-colors disabled:opacity-50"
                >
                  Annulla
                </button>
                <button
                  type="submit"
                  disabled={isProcessing}
                  className={`flex-1 py-3.5 rounded-xl font-medium transition-all disabled:opacity-50 bg-gradient-to-r ${roleConfig[userToAction.role]?.gradient || 'from-slate-500 to-slate-600'} text-white shadow-lg`}
                >
                  {isProcessing ? '⏳ Salvataggio...' : '✅ Salva Modifiche'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <style jsx>{`
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in {
          animation: fade-in 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}
