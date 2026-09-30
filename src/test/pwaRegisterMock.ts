// Testlerde service worker kaydı yerine kullanılan sahte modül.
export const pwaState = { needRefresh: false, updateCalls: 0 };

export function useRegisterSW() {
  return {
    needRefresh: [pwaState.needRefresh, (v: boolean) => (pwaState.needRefresh = v)] as const,
    offlineReady: [false, () => {}] as const,
    updateServiceWorker: async () => {
      pwaState.updateCalls++;
    },
  };
}
