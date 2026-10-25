import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { UserRole, Project } from '../types';
import {
  Shield,
  GitBranch,
  Kanban,
  FileCode2,
  BarChart3,
  LogOut,
  ChevronDown,
  UserCheck,
  FolderGit2,
  GitMerge,
  HardDrive,
  Upload,
} from 'lucide-react';

interface NavbarProps {
  currentTab: 'projects' | 'board' | 'graph' | 'inspector' | 'dashboard';
  setCurrentTab: (tab: 'projects' | 'board' | 'graph' | 'inspector' | 'dashboard') => void;
  projects: Project[];
  selectedProjectId: number | null;
  onSelectProject: (id: number) => void;
  onOpenUploadModal: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentTab,
  setCurrentTab,
  projects,
  selectedProjectId,
  onSelectProject,
  onOpenUploadModal,
}) => {
  const { currentUser, allUsers, switchUser, logout } = useAuth();
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);

  const isManager = currentUser?.role === UserRole.MANAGER;

  return (
    <header className="sticky top-0 z-40 bg-slate-900/95 backdrop-blur-md border-b border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Brand */}
          <div className="flex items-center space-x-6">
            <div className="flex items-center space-x-2.5 cursor-pointer" onClick={() => setCurrentTab('board')}>
              <div className="w-9 h-9 rounded-lg bg-blue-600/20 border border-blue-500/40 flex items-center justify-center text-blue-400">
                <Shield className="w-5 h-5" />
              </div>
              <div>
                <span className="text-lg font-bold tracking-tight text-white flex items-center gap-1.5">
                  SprintVault
                  <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-blue-900/60 text-blue-300 border border-blue-700/50">
                    Offline
                  </span>
                </span>
                <p className="text-[11px] text-slate-400 leading-none">Scrum + Git Commit Graph</p>
              </div>
            </div>

            {/* Project Selector */}
            <div className="hidden md:flex items-center space-x-2 bg-slate-800/80 rounded-lg p-1 border border-slate-700">
              <FolderGit2 className="w-4 h-4 text-slate-400 ml-2" />
              <select
                aria-label="Active Project"
                value={selectedProjectId || ''}
                onChange={(e) => {
                  onSelectProject(Number(e.target.value));
                  if (currentTab === 'projects') setCurrentTab('board');
                }}
                className="bg-transparent text-xs text-slate-200 focus:outline-none cursor-pointer pr-2 py-1 max-w-[180px] truncate"
              >
                {projects.map((p) => (
                  <option key={p.projectId} value={p.projectId} className="bg-slate-900 text-slate-200">
                    {p.name}
                  </option>
                ))}
              </select>
              {isManager && (
                <button
                  onClick={onOpenUploadModal}
                  className="text-xs bg-blue-600 hover:bg-blue-500 text-white px-2 py-1 rounded transition flex items-center gap-1"
                  title="Upload or Import Project"
                >
                  <Upload className="w-3 h-3" />
                  <span>Upload</span>
                </button>
              )}
            </div>
          </div>

          {/* Navigation Tabs */}
          <nav className="hidden lg:flex items-center space-x-1">
            <button
              onClick={() => setCurrentTab('projects')}
              className={`flex items-center space-x-1.5 px-3 py-2 rounded-md text-xs font-semibold transition ${
                currentTab === 'projects'
                  ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <FolderGit2 className="w-4 h-4" />
              <span>Projects ({projects.length})</span>
            </button>

            <button
              onClick={() => setCurrentTab('board')}
              className={`flex items-center space-x-1.5 px-3 py-2 rounded-md text-xs font-semibold transition ${
                currentTab === 'board'
                  ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <Kanban className="w-4 h-4" />
              <span>Scrum Board</span>
            </button>

            <button
              onClick={() => setCurrentTab('graph')}
              className={`flex items-center space-x-1.5 px-3 py-2 rounded-md text-xs font-semibold transition ${
                currentTab === 'graph'
                  ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <GitMerge className="w-4 h-4" />
              <span>Git Commit Graph</span>
            </button>

            <button
              onClick={() => setCurrentTab('inspector')}
              className={`flex items-center space-x-1.5 px-3 py-2 rounded-md text-xs font-semibold transition ${
                currentTab === 'inspector'
                  ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <HardDrive className="w-4 h-4" />
              <span>.git & .scrum.json</span>
            </button>

            <button
              onClick={() => setCurrentTab('dashboard')}
              className={`flex items-center space-x-1.5 px-3 py-2 rounded-md text-xs font-semibold transition ${
                currentTab === 'dashboard'
                  ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <BarChart3 className="w-4 h-4" />
              <span>Team Stats</span>
            </button>
          </nav>

          {/* User Persona Switcher */}
          <div className="flex items-center space-x-3">
            <div className="relative">
              <button
                onClick={() => setUserDropdownOpen(!userDropdownOpen)}
                className="flex items-center space-x-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-1.5 rounded-lg border border-slate-700 text-xs transition"
              >
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                    isManager ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  }`}
                >
                  {isManager ? 'TL' : 'DEV'}
                </div>
                <div className="text-left hidden sm:block">
                  <div className="font-semibold text-white leading-tight">{currentUser?.name}</div>
                  <div className="text-[10px] text-slate-400 capitalize">{isManager ? 'Team Lead' : 'Developer'}</div>
                </div>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              </button>

              {userDropdownOpen && (
                <div className="absolute right-0 mt-2 w-64 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl py-2 z-50">
                  <div className="px-3 py-1.5 border-b border-slate-800">
                    <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                      Switch Persona (5 Users)
                    </span>
                  </div>
                  <div className="py-1">
                    {allUsers.map((u) => {
                      const active = u.email === currentUser?.email;
                      const isTL = u.role === UserRole.MANAGER;
                      return (
                        <button
                          key={u.user_id}
                          onClick={() => {
                            switchUser(u.email);
                            setUserDropdownOpen(false);
                          }}
                          className={`w-full text-left px-3 py-2 flex items-center justify-between text-xs transition ${
                            active
                              ? 'bg-blue-600/20 text-blue-300 font-medium'
                              : 'text-slate-300 hover:bg-slate-800'
                          }`}
                        >
                          <div className="flex items-center space-x-2">
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                isTL ? 'bg-amber-950 text-amber-300 border border-amber-800' : 'bg-slate-800 text-slate-300 border border-slate-700'
                              }`}
                            >
                              {isTL ? 'TL' : 'DEV'}
                            </span>
                            <div>
                              <div className="text-white">{u.name}</div>
                              <div className="text-[10px] text-slate-400">{u.email}</div>
                            </div>
                          </div>
                          {active && <UserCheck className="w-4 h-4 text-blue-400" />}
                        </button>
                      );
                    })}
                  </div>
                  <div className="border-t border-slate-800 pt-1 mt-1">
                    <button
                      onClick={logout}
                      className="w-full text-left px-3 py-2 flex items-center space-x-2 text-xs text-rose-400 hover:bg-rose-950/30 transition"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>Log Out</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Mobile Navigation */}
        <div className="lg:hidden flex items-center justify-around py-2 border-t border-slate-800 text-xs">
          <button
            onClick={() => setCurrentTab('projects')}
            className={`py-1 px-2 rounded ${currentTab === 'projects' ? 'text-blue-400 font-semibold' : 'text-slate-400'}`}
          >
            Projects
          </button>
          <button
            onClick={() => setCurrentTab('board')}
            className={`py-1 px-2 rounded ${currentTab === 'board' ? 'text-blue-400 font-semibold' : 'text-slate-400'}`}
          >
            Board
          </button>
          <button
            onClick={() => setCurrentTab('graph')}
            className={`py-1 px-2 rounded ${currentTab === 'graph' ? 'text-blue-400 font-semibold' : 'text-slate-400'}`}
          >
            Git Graph
          </button>
          <button
            onClick={() => setCurrentTab('inspector')}
            className={`py-1 px-2 rounded ${currentTab === 'inspector' ? 'text-blue-400 font-semibold' : 'text-slate-400'}`}
          >
            .git / .scrum
          </button>
          <button
            onClick={() => setCurrentTab('dashboard')}
            className={`py-1 px-2 rounded ${currentTab === 'dashboard' ? 'text-blue-400 font-semibold' : 'text-slate-400'}`}
          >
            Stats
          </button>
        </div>
      </div>
    </header>
  );
};
