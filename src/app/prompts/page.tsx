import type { Metadata } from 'next';
import PromptLibrary from '@/components/prompts/PromptLibrary';

export const metadata: Metadata = {
  title: 'Prompt Library - Autonomous AI Voice Agent Templates',
  description: '10 battle-tested system prompt templates for dealership, e-commerce, healthcare, real estate, and more.',
};

export default function PromptsPage() {
  return <PromptLibrary isEmbedded={false} />;
}
