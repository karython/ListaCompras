import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import Auth from './components/Auth';
import ShoppingList from './components/ShoppingList';
import ShoppingMode from './components/ShoppingMode';
import History from './components/History';
import Analytics from './components/Analytics';
import { ShoppingCart, ShoppingBag, Clock, BarChart2, LogOut } from 'lucide-react';

const NAV_TABS = [
  { key: 'list', icon: ShoppingCart, label: 'Lista' },
  { key: 'shopping', icon: ShoppingBag, label: 'Fazer Compras' },
  { key: 'history', icon: Clock, label: 'Histórico' },
  { key: 'analytics', icon: BarChart2, label: 'Análises' },
];

export default function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('list');
  const [firstName, setFirstName] = useState('');
  const [joinNotification, setJoinNotification] = useState('');

  // Capture share token from URL before anything else
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('share');
    if (token) {
      sessionStorage.setItem('pendingShareToken', token);
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });
    return () => subscription.unsubscribe();
  }, []);

  // Load first name from profile
  useEffect(() => {
    if (!session?.user) { setFirstName(''); return; }
    supabase
      .from('profiles').select('full_name').eq('id', session.user.id).maybeSingle()
      .then(({ data }) => { if (data?.full_name) setFirstName(data.full_name.split(' ')[0]); });
  }, [session]);

  // Process pending share token after login
  useEffect(() => {
    if (!session?.user) return;
    const processToken = async () => {
      const token = sessionStorage.getItem('pendingShareToken');
      if (!token) return;
      sessionStorage.removeItem('pendingShareToken');

      const { data: share } = await supabase
        .from('list_shares').select('list_id, owner_id')
        .eq('share_token', token).maybeSingle();

      if (!share) {
        setJoinNotification('Link de compartilhamento inválido ou expirado.');
        return;
      }
      if (share.owner_id === session.user.id) {
        setJoinNotification('Você já é o dono desta lista!');
        setView('shopping');
        return;
      }

      const { error } = await supabase.from('list_members').upsert(
        { list_id: share.list_id, user_id: session.user.id, role: 'member' },
        { onConflict: 'list_id,user_id' }
      );

      if (!error) {
        setJoinNotification('Lista compartilhada adicionada com sucesso!');
        setView('shopping');
      }
    };
    processToken();
  }, [session]);

  // Auto-dismiss notification
  useEffect(() => {
    if (!joinNotification) return;
    const t = setTimeout(() => setJoinNotification(''), 4000);
    return () => clearTimeout(t);
  }, [joinNotification]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <ShoppingCart className="mx-auto text-blue-400 mb-3" size={32} />
          <p className="text-gray-400 text-sm">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!session) return <Auth />;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Fixed header */}
      <header className="fixed top-0 left-0 right-0 z-40 bg-blue-600 shadow-md">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <ShoppingCart size={20} className="text-blue-100" />
            <div>
              <h1 className="font-bold text-white text-sm leading-tight">Lista de Compras</h1>
              {firstName && <p className="text-blue-200 text-xs">Olá, {firstName}!</p>}
            </div>
          </div>
          <button
            onClick={() => supabase.auth.signOut()}
            className="text-blue-200 hover:text-white p-1.5 rounded-lg hover:bg-blue-700 transition-colors"
            title="Sair"
          >
            <LogOut size={17} />
          </button>
        </div>
      </header>

      {/* Join notification */}
      {joinNotification && (
        <div className="fixed top-[70px] left-4 right-4 max-w-lg mx-auto bg-green-500 text-white px-4 py-3 rounded-xl shadow-lg z-50 text-sm font-medium text-center">
          {joinNotification}
        </div>
      )}

      {/* Scrollable content */}
      <main className="max-w-lg mx-auto pt-16 pb-20">
        {view === 'list' && <ShoppingList key={session.user.id} session={session} />}
        {view === 'shopping' && <ShoppingMode key={session.user.id} session={session} />}
        {view === 'history' && <History key={session.user.id} session={session} />}
        {view === 'analytics' && <Analytics key={session.user.id} session={session} />}
      </main>

      {/* Fixed bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 shadow-lg">
        <div className="max-w-lg mx-auto flex">
          {NAV_TABS.map(({ key, icon: Icon, label }) => (
            <button
              key={key}
              onClick={() => setView(key)}
              className={`flex-1 py-3 flex flex-col items-center gap-0.5 text-xs font-medium transition-colors ${
                view === key ? 'text-blue-600' : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              <Icon size={20} strokeWidth={view === key ? 2.5 : 1.75} />
              {label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
