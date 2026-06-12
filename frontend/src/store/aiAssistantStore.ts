import { create } from 'zustand'

interface AIAssistantState {
  isOpen: boolean
  preloadedMessage: string | null
  hasUnseenInsight: boolean
  open: (message?: string) => void
  close: () => void
  clearPreloaded: () => void
  triggerInsight: () => void
}

export const useAIAssistantStore = create<AIAssistantState>((set) => ({
  isOpen: false,
  preloadedMessage: null,
  hasUnseenInsight: false,
  open: (message) =>
    set({ isOpen: true, preloadedMessage: message ?? null, hasUnseenInsight: false }),
  close: () => set({ isOpen: false }),
  clearPreloaded: () => set({ preloadedMessage: null }),
  triggerInsight: () => set((s) => (s.isOpen ? {} : { hasUnseenInsight: true })),
}))
