import { create } from 'zustand'

interface NavigationState {
    isDirty: boolean
    setDirty: (isDirty: boolean) => void
}

export const useNavigationStore = create<NavigationState>((set) => ({
    isDirty: false,
    setDirty: (isDirty) => set({ isDirty }),
}))
