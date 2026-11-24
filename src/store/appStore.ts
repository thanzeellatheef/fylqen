import { create } from 'zustand'

type AppState = {
  selectedFile: File | null
  setSelectedFile: (file: File | null) => void
}

export const useAppStore = create<AppState>((set) => ({
  selectedFile: null,
  setSelectedFile: (selectedFile) => set({ selectedFile }),
}))
