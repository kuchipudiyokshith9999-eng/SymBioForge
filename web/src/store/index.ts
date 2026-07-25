import { create } from "zustand"

interface User {
  id: string
  name: string
  email: string
  role: string
}

interface AppState {
  user: User | null
  sidebarExpanded: boolean
  setUser: (user: User | null) => void
  toggleSidebar: () => void
}

export const useAppStore = create<AppState>((set) => ({
  user: {
    id: "u_1",
    name: "Admin User",
    email: "admin@symbioforge.com",
    role: "admin",
  },
  sidebarExpanded: true,
  setUser: (user) => set({ user }),
  toggleSidebar: () => set((state) => ({ sidebarExpanded: !state.sidebarExpanded })),
}))
