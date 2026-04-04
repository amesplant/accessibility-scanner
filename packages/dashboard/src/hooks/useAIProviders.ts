import { useEffect, useState } from 'react';

export interface AIProvider {
  id: string;
  label: string;
}

export function useAIProviders() {
  const [providers, setProviders] = useState<AIProvider[]>([]);

  useEffect(() => {
    fetch('/api/ai/providers')
      .then(r => r.json())
      .then((data: { providers: AIProvider[] }) => setProviders(data.providers))
      .catch(() => { /* server unreachable — leave empty */ });
  }, []);

  return providers;
}
