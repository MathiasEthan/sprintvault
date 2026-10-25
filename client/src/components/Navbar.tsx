import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { UserRole, Project } from '../types';
import { ChevronDown, Check } from 'lucide-react';

type Tab = 'projects' | 'board' | 'graph' | 'inspector' | 'dashboard';

interface NavbarProps {
  currentTab: Tab;
  setCurrentTab: (tab: Tab) => void;
  projects: Project[];
  selectedProjectId: number | null;
  onSelectProject: (id: number) => void;
  onOpenUploadModal: () => void;
  connected: boolean;
}

const TABS: { id: Tab; label: string }[] = [
  { id: 'board', label: 'Board' },
  { id: 'graph', label: 'History' },
  { id: 'inspector', label: 'Repository' },
  { id: 'dashboard', label: 'Team' },
  { id: 'projects', label: 'Projects' },
];

export const Navbar: React.FC<NavbarProps> = ({
  currentTab,
  setCurrentTab,
  projects,
  selectedProjectId,
  onSelectProject,
  connected,
}) => {
  const { currentUser, demoUsers, demoMode, switchUser, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const isManager = currentUser?.role === UserRole.MANAGER;

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menuOpen]);

  return (
    <header className="sticky top-0 z-40 border-b border-slate-800 bg-black">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-4 sm:px-6">
        <button onClick={() => setCurrentTab('board')} className="font-display text-base text-slate-50">
          SprintVault
        </button>

        {projects.length > 0 && (
          <div className="relative hidden md:block">
            <select
              aria-label="Project"
              value={selectedProjectId || ''}
              onChange={(e) => {
                onSelectProject(Number(e.target.value));
                if (currentTab === 'projects') setCurrentTab('board');
              }}
              className="h-8 max-w-[220px] cursor-pointer appearance-none truncate rounded border border-slate-800 bg-black pl-2.5 pr-7 text-sm text-slate-100 hover:border-slate-600 focus:border-blue-500 focus:outline-none"
            >
              {projects.map((p) => (
                <option key={p.projectId} value={p.projectId} className="bg-slate-900">
                  {p.name}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-2 h-4 w-4 text-slate-500" />
          </div>
        )}

        <nav aria-label="Sections" className="hidden h-14 items-stretch gap-5 lg:flex">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setCurrentTab(t.id)}
              aria-current={currentTab === t.id ? 'page' : undefined}
              className={`border-b-2 pt-0.5 text-sm transition-colors ${
                currentTab === t.id
                  ? 'border-blue-400 text-slate-50'
                  : 'border-transparent text-slate-400 hover:text-slate-100'
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-5">
          <span
            className="hidden items-center gap-1.5 text-xs text-slate-400 sm:flex"
            title={connected ? 'Changes from your team appear automatically' : 'Cannot reach the server'}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${connected ? 'bg-blue-400' : 'bg-rose-500'}`} />
            {connected ? 'Live' : 'Offline'}
          </span>

          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              aria-expanded={menuOpen}
              className="flex items-center gap-2 text-left text-sm"
            >
              <span className="hidden sm:block">
                <span className="block leading-tight text-slate-100">{currentUser?.name}</span>
                <span className="block text-xs leading-tight text-slate-500">{isManager ? 'Team lead' : 'Developer'}</span>
              </span>
              <ChevronDown className="h-4 w-4 text-slate-500" />
            </button>

            {menuOpen && (
              <div className="absolute right-0 mt-2 w-64 rounded-md border border-slate-800 bg-slate-900 py-1">
                {demoMode && (
                  <>
                    <p className="px-3 pb-1 pt-2 text-xs text-slate-500">Switch user (demo)</p>
                    {demoUsers.map((u) => {
                      const active = u.email === currentUser?.email;
                      return (
                        <button
                          key={u.user_id}
                          onClick={() => {
                            switchUser(u.email);
                            setMenuOpen(false);
                          }}
                          className="flex w-full items-center justify-between px-3 py-1.5 text-left text-sm text-slate-200 hover:bg-slate-800"
                        >
                          <span>
                            {u.name}
                            <span className="ml-2 text-xs text-slate-500">{u.role === UserRole.MANAGER ? 'lead' : 'dev'}</span>
                          </span>
                          {active && <Check className="h-4 w-4 text-blue-400" />}
                        </button>
                      );
                    })}
                    <div className="my-1 border-t border-slate-800" />
                  </>
                )}
                <button onClick={logout} className="w-full px-3 py-1.5 text-left text-sm text-slate-300 hover:bg-slate-800">
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Small screens: project + sections */}
      <div className="flex items-center gap-4 overflow-x-auto border-t border-slate-800 px-4 lg:hidden">
        {projects.length > 0 && (
          <select
            aria-label="Project"
            value={selectedProjectId || ''}
            onChange={(e) => onSelectProject(Number(e.target.value))}
            className="h-10 max-w-[150px] shrink-0 truncate bg-black text-sm text-slate-100 md:hidden"
          >
            {projects.map((p) => (
              <option key={p.projectId} value={p.projectId}>
                {p.name}
              </option>
            ))}
          </select>
        )}
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setCurrentTab(t.id)}
            className={`h-10 shrink-0 border-b-2 text-sm ${
              currentTab === t.id ? 'border-blue-400 text-slate-50' : 'border-transparent text-slate-400'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
    </header>
  );
};
