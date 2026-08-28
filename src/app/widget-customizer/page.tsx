import type { Metadata } from 'next';
import WidgetCustomizerApp from '@/components/widget-customizer/WidgetCustomizerApp';

export const metadata: Metadata = {
  title: 'Widget Customizer — AutoMate',
  description: 'Visually configure and customize the AI voice & dealership widget for your deployment.',
};

export default function WidgetCustomizerPage() {
  return <WidgetCustomizerApp />;
}
