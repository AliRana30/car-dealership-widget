'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import {
  Car,
  ShoppingBag,
  Stethoscope,
  Building,
  GraduationCap,
  Utensils,
  Laptop,
  ShieldCheck,
  Scale,
  Dumbbell,
  Search,
  Copy,
  Check,
  Sparkles,
  BookOpen,
  Volume2,
  Wrench,
  ArrowLeft,
  X,
} from 'lucide-react';
import { PROMPT_TEMPLATES, PromptTemplate } from '@/data/promptTemplates';

interface PromptLibraryProps {
  isEmbedded?: boolean;
}

export default function PromptLibrary({ isEmbedded = false }: PromptLibraryProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<PromptTemplate | null>(null);

  const categories = useMemo(() => {
    const list = [
      { id: 'all', label: 'All Industries' },
      { id: 'automotive', label: 'Automotive & Dealership' },
      { id: 'ecommerce', label: 'E-Commerce & Retail' },
      { id: 'healthcare', label: 'Healthcare & Clinic' },
      { id: 'realestate', label: 'Real Estate & Property' },
      { id: 'edtech', label: 'LMS & Online Academy' },
      { id: 'hospitality', label: 'Restaurant & Dining' },
      { id: 'saas', label: 'SaaS & Tech Support' },
      { id: 'finance', label: 'Finance & Insurance' },
      { id: 'legal', label: 'Legal & Law Practice' },
      { id: 'fitness', label: 'Gym & Wellness Spa' },
    ];
    return list;
  }, []);

  const filteredTemplates = useMemo(() => {
    return PROMPT_TEMPLATES.filter(item => {
      const matchesCategory = selectedCategory === 'all' || item.category === selectedCategory;
      const q = searchQuery.toLowerCase().trim();
      if (!q) return matchesCategory;

      const matchesSearch =
        item.title.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.categoryLabel.toLowerCase().includes(q) ||
        item.recommendedTools.some(t => t.toLowerCase().includes(q)) ||
        item.systemPrompt.toLowerCase().includes(q);

      return matchesCategory && matchesSearch;
    });
  }, [searchQuery, selectedCategory]);

  const handleCopyPrompt = (template: PromptTemplate) => {
    navigator.clipboard.writeText(template.systemPrompt)
      .then(() => {
        setCopiedId(template.id);
        toast.success(`Copied prompt for ${template.title}!`, { icon: '✨' });
        setTimeout(() => setCopiedId(null), 2500);
      })
      .catch(() => {
        const ta = document.createElement('textarea');
        ta.value = template.systemPrompt;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        setCopiedId(template.id);
        toast.success(`Copied prompt for ${template.title}!`, { icon: '✨' });
        setTimeout(() => setCopiedId(null), 2500);
      });
  };

  const renderIcon = (iconName: string, size = 20) => {
    switch (iconName) {
      case 'Car': return <Car size={size} />;
      case 'ShoppingBag': return <ShoppingBag size={size} />;
      case 'Stethoscope': return <Stethoscope size={size} />;
      case 'Building': return <Building size={size} />;
      case 'GraduationCap': return <GraduationCap size={size} />;
      case 'Utensils': return <Utensils size={size} />;
      case 'Laptop': return <Laptop size={size} />;
      case 'ShieldCheck': return <ShieldCheck size={size} />;
      case 'Scale': return <Scale size={size} />;
      case 'Dumbbell': return <Dumbbell size={size} />;
      default: return <Sparkles size={size} />;
    }
  };

  return (
    <div style={{ width: '100%', minHeight: isEmbedded ? 'auto' : '100vh', background: isEmbedded ? 'transparent' : '#F8FAFC' }}>
      {/* Header bar if standalone page */}
      {!isEmbedded && (
        <header style={{
          height: '64px',
          background: '#FFFFFF',
          borderBottom: '1px solid #E2E8F0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 28px',
          position: 'sticky',
          top: 0,
          zIndex: 40,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <Link href="/dashboard" style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#64748B', textDecoration: 'none', fontSize: '13.5px', fontWeight: 500 }}>
              <ArrowLeft size={16} />
              Dashboard
            </Link>
            <span style={{ color: '#CBD5E1' }}>/</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <img src="/logo.png" alt="Logo" style={{ width: '26px', height: '26px', objectFit: 'contain' }} />
              <span style={{ fontWeight: 700, fontSize: '16px', color: '#0F172A' }}>Prompt Library</span>
              <span style={{ background: '#EFF6FF', color: '#2563EB', fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '12px', border: '1px solid #BFDBFE' }}>
                10 Industry Agents
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Link href="/" style={{ color: '#475569', textDecoration: 'none', fontSize: '13.5px', fontWeight: 500 }}>
              Home
            </Link>
            <Link href="/widget-customizer" style={{
              background: '#2563EB',
              color: '#FFFFFF',
              padding: '7px 14px',
              borderRadius: '8px',
              textDecoration: 'none',
              fontSize: '13px',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}>
              <Sparkles size={14} />
              Open Customizer
            </Link>
          </div>
        </header>
      )}

      {/* Main Content Area */}
      <div style={{ maxWidth: '1240px', margin: '0 auto', padding: isEmbedded ? '16px 0' : '32px 20px', boxSizing: 'border-box', width: '100%' }}>
        {/* Banner Section - clean, no badge, no stats chips */}
        <div style={{
          background: 'linear-gradient(135deg, #1E293B 0%, #0F172A 100%)',
          borderRadius: '16px',
          padding: '28px 28px',
          color: '#FFFFFF',
          boxShadow: '0 8px 24px -6px rgba(15,23,42,0.3)',
          marginBottom: '24px',
          boxSizing: 'border-box',
          width: '100%',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px' }}>
            <div style={{ width: '32px', height: '32px', background: 'rgba(37,99,235,0.25)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <BookOpen size={16} color="#93C5FD" />
            </div>
            <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.2 }}>
              AI Agent Prompt Library
            </h1>
          </div>
          <p style={{ margin: 0, fontSize: '13.5px', color: '#94A3B8', lineHeight: 1.55, maxWidth: '540px' }}>
            Expertly tuned system prompts, conversational constraints, and tool definitions for 10 common business verticals.
          </p>
        </div>

        {/* Search & Category Filter Bar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px', width: '100%', boxSizing: 'border-box' }}>
          {/* Search Input */}
          <div style={{ position: 'relative', width: '100%', boxSizing: 'border-box' }}>
            <Search size={16} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8', pointerEvents: 'none' }} />
            <input
              type="text"
              placeholder="Search prompts by industry, keywords, tool function..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '11px 14px 11px 40px',
                borderRadius: '10px',
                border: '1px solid #E2E8F0',
                background: '#FFFFFF',
                fontSize: '13.5px',
                color: '#0F172A',
                boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Category Chips Scroll */}
          <div style={{
            display: 'flex',
            gap: '6px',
            overflowX: 'auto',
            paddingBottom: '2px',
            msOverflowStyle: 'none',
            scrollbarWidth: 'none',
            width: '100%',
          }}>
            {categories.map(cat => {
              const active = selectedCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  style={{
                    padding: '7px 14px',
                    borderRadius: '20px',
                    fontSize: '13px',
                    fontWeight: active ? 600 : 500,
                    border: active ? '1px solid #2563EB' : '1px solid #E2E8F0',
                    background: active ? '#2563EB' : '#FFFFFF',
                    color: active ? '#FFFFFF' : '#475569',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    transition: 'all 0.15s ease',
                    boxShadow: active ? '0 2px 8px rgba(37,99,235,0.25)' : 'none',
                  }}
                >
                  {cat.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Templates Grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
          gap: '16px',
          width: '100%',
          boxSizing: 'border-box',
        }}>
          {filteredTemplates.map(template => {
            const isCopied = copiedId === template.id;
            return (
              <div
                key={template.id}
                style={{
                  background: '#FFFFFF',
                  borderRadius: '16px',
                  border: '1px solid #E2E8F0',
                  padding: '24px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '16px',
                  boxShadow: '0 4px 16px -4px rgba(0,0,0,0.05)',
                  transition: 'transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease',
                  position: 'relative',
                }}
              >
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{
                      width: '42px',
                      height: '42px',
                      borderRadius: '12px',
                      background: '#EFF6FF',
                      color: '#2563EB',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      border: '1px solid #DBEAFE',
                      flexShrink: 0,
                    }}>
                      {renderIcon(template.iconName, 20)}
                    </div>
                    <div>
                      <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#0F172A', lineHeight: 1.3 }}>
                        {template.title}
                      </h3>
                      <span style={{ fontSize: '11.5px', color: '#64748B', fontWeight: 500 }}>
                        {template.categoryLabel}
                      </span>
                    </div>
                  </div>

                  <span style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    padding: '2px 8px',
                    borderRadius: '10px',
                    background: '#F1F5F9',
                    color: '#475569',
                    border: '1px solid #E2E8F0',
                    whiteSpace: 'nowrap',
                  }}>
                    {template.badge}
                  </span>
                </div>

                <p style={{ margin: 0, fontSize: '13px', color: '#475569', lineHeight: 1.5 }}>
                  {template.description}
                </p>

                {/* Sample Greeting */}
                <div style={{
                  background: '#F8FAFC',
                  borderRadius: '10px',
                  padding: '10px 12px',
                  border: '1px solid #E2E8F0',
                  fontSize: '12.5px',
                  color: '#334155',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', marginBottom: '4px', letterSpacing: '0.04em' }}>
                    <Volume2 size={12} />
                    Sample Voice Greeting
                  </div>
                  <div style={{ fontStyle: 'italic', lineHeight: 1.4 }}>
                    &ldquo;{template.sampleGreeting}&rdquo;
                  </div>
                </div>

                {/* Recommended Tools Tags */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', marginBottom: '6px', letterSpacing: '0.04em' }}>
                    <Wrench size={11} />
                    Recommended Agent Tools
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {template.recommendedTools.map(tool => (
                      <span key={tool} style={{
                        fontSize: '11px',
                        fontFamily: 'monospace',
                        padding: '2px 7px',
                        borderRadius: '6px',
                        background: '#EEF2F6',
                        color: '#1E293B',
                        border: '1px solid #E2E8F0',
                      }}>
                        {tool}()
                      </span>
                    ))}
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: '10px', marginTop: 'auto', paddingTop: '8px' }}>
                  <button
                    onClick={() => handleCopyPrompt(template)}
                    style={{
                      flex: 1,
                      padding: '8px 14px',
                      borderRadius: '8px',
                      fontSize: '13px',
                      fontWeight: 600,
                      border: isCopied ? '1px solid #16A34A' : '1px solid #2563EB',
                      background: isCopied ? '#16A34A' : '#2563EB',
                      color: '#FFFFFF',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {isCopied ? <Check size={15} /> : <Copy size={15} />}
                    {isCopied ? 'Copied Prompt!' : 'Copy System Prompt'}
                  </button>

                  <button
                    onClick={() => setSelectedTemplate(template)}
                    style={{
                      padding: '8px 12px',
                      borderRadius: '8px',
                      fontSize: '13px',
                      fontWeight: 600,
                      border: '1px solid #E2E8F0',
                      background: '#FFFFFF',
                      color: '#334155',
                      cursor: 'pointer',
                    }}
                  >
                    View Full
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {filteredTemplates.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px 20px', background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E2E8F0' }}>
            <Search size={32} style={{ color: '#94A3B8', marginBottom: '12px' }} />
            <h3 style={{ margin: '0 0 6px', fontSize: '17px', color: '#0F172A' }}>No templates matched your query</h3>
            <p style={{ margin: 0, fontSize: '13.5px', color: '#64748B' }}>Try searching for a different industry, tool name, or reset the category filter.</p>
          </div>
        )}
      </div>

      {/* Full Prompt View Modal */}
      {selectedTemplate && (
        <div style={{
          position: 'fixed',
          inset: 0,
          zIndex: 100,
          background: 'rgba(15,23,42,0.6)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px',
        }}>
          <div style={{
            background: '#FFFFFF',
            borderRadius: '20px',
            width: '100%',
            maxWidth: '740px',
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 24px 60px -12px rgba(0,0,0,0.3)',
            overflow: 'hidden',
          }}>
            {/* Modal Header */}
            <div style={{
              padding: '20px 24px',
              borderBottom: '1px solid #E2E8F0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{
                  width: '38px', height: '38px', borderRadius: '10px',
                  background: '#EFF6FF', color: '#2563EB',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  border: '1px solid #DBEAFE',
                }}>
                  {renderIcon(selectedTemplate.iconName, 18)}
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 700, color: '#0F172A' }}>
                    {selectedTemplate.title}
                  </h3>
                  <span style={{ fontSize: '12px', color: '#64748B' }}>{selectedTemplate.categoryLabel}</span>
                </div>
              </div>

              <button
                onClick={() => setSelectedTemplate(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#64748B',
                  cursor: 'pointer',
                  padding: '6px',
                  borderRadius: '6px',
                }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ background: '#F8FAFC', padding: '14px', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', marginBottom: '4px' }}>
                  Sample Opener Audio
                </div>
                <div style={{ fontSize: '13.5px', color: '#1E293B', fontStyle: 'italic' }}>
                  &ldquo;{selectedTemplate.sampleGreeting}&rdquo;
                </div>
              </div>

              <div>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '8px' }}>
                  Complete System Prompt (Ready for Retell / Vapi / Custom Agents):
                </div>
                <pre style={{
                  background: '#0F172A',
                  color: '#F8FAFC',
                  padding: '16px',
                  borderRadius: '12px',
                  fontSize: '12.5px',
                  lineHeight: 1.6,
                  overflowX: 'auto',
                  whiteSpace: 'pre-wrap',
                  fontFamily: 'monospace',
                  margin: 0,
                }}>
                  {selectedTemplate.systemPrompt}
                </pre>
              </div>
            </div>

            {/* Modal Footer */}
            <div style={{
              padding: '16px 24px',
              borderTop: '1px solid #E2E8F0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: '12px',
              background: '#F8FAFC',
            }}>
              <button
                onClick={() => setSelectedTemplate(null)}
                style={{
                  padding: '8px 16px',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: 600,
                  border: '1px solid #E2E8F0',
                  background: '#FFFFFF',
                  color: '#475569',
                  cursor: 'pointer',
                }}
              >
                Close
              </button>
              <button
                onClick={() => handleCopyPrompt(selectedTemplate)}
                style={{
                  padding: '8px 18px',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: 600,
                  border: 'none',
                  background: '#2563EB',
                  color: '#FFFFFF',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  cursor: 'pointer',
                }}
              >
                <Copy size={15} />
                Copy System Prompt
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
