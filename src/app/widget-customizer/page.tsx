import type { Metadata } from 'next';
import WidgetCustomizerApp from '@/components/widget-customizer/WidgetCustomizerApp';

export const metadata: Metadata = {
  title: 'Widget Customizer — MyFrontDesk',
  description: 'Visually configure and customize the AI voice widget for your deployment.',
};

export default function WidgetCustomizerPage() {
  return <WidgetCustomizerApp />;
}
