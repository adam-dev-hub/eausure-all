'use client';

/* eslint-disable @next/next/no-img-element */

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Upload, Link as LinkIcon, Check } from 'lucide-react';

interface AvatarSelectorProps {
  currentAvatar: string;
  userName: string;
  onAvatarChange: (url: string) => void;
}

const generateDiceBearUrl = (style: string, seed: string, variant?: number): string => {
  const baseUrl = `https://api.dicebear.com/9.x/${style}/svg?seed=${encodeURIComponent(seed)}`;
  return variant !== undefined ? `${baseUrl}&variant=${variant}` : baseUrl;
};

export function AvatarSelector({ currentAvatar, userName, onAvatarChange }: AvatarSelectorProps) {
  const [selectedTab, setSelectedTab] = useState<'suggested' | 'custom'>('suggested');
  const [customUrl, setCustomUrl] = useState(currentAvatar || '');
  const [selectedAvatar, setSelectedAvatar] = useState(currentAvatar || '');

  // Generate suggested avatars based on user name (12 glass variants)
  const suggestedAvatars = useMemo(
    () => Array.from({ length: 12 }, (_, i) => ({
      id: `glass-${i}`,
      url: generateDiceBearUrl('glass', `${userName || 'user'}-${i}`),
      style: `glass-${i + 1}`,
    })),
    [userName]
  );

  const handleSuggestedSelect = (url: string) => {
    setSelectedAvatar(url);
    onAvatarChange(url);
  };

  const handleCustomUrlChange = (url: string) => {
    setCustomUrl(url);
    setSelectedAvatar(url);
    onAvatarChange(url);
  };

  return (
    <div className="space-y-4">
      <Tabs value={selectedTab} onValueChange={(v) => setSelectedTab(v as 'suggested' | 'custom')}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="suggested">Suggested</TabsTrigger>
          <TabsTrigger value="custom">Custom</TabsTrigger>
        </TabsList>

        <TabsContent value="suggested" className="space-y-4">
          <TooltipProvider>
            <div className="grid grid-cols-6 gap-3">
              {suggestedAvatars.map((avatar) => (
                <Tooltip key={avatar.id}>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => handleSuggestedSelect(avatar.url)}
                      className={`
                        group relative rounded-lg p-2 transition-all duration-200
                        backdrop-blur-sm bg-background/30 border border-border/50
                        hover:bg-background/50 hover:border-border
                        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
                        ${selectedAvatar === avatar.url ? 'bg-primary/10 border-primary shadow-sm' : ''}
                      `}
                    >
                      <div className="relative">
                        <img 
                          src={avatar.url} 
                          alt={avatar.style}
                          className="h-12 w-12 rounded-md"
                        />
                        {selectedAvatar === avatar.url && (
                          <div className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm">
                            <Check className="h-2.5 w-2.5" />
                          </div>
                        )}
                      </div>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="capitalize">{avatar.style.replace(/-/g, ' ')}</p>
                  </TooltipContent>
                </Tooltip>
              ))}
            </div>
          </TooltipProvider>
          <p className="text-xs text-muted-foreground">
            Select an avatar style. Generated using DiceBear avatars based on your name.
          </p>
        </TabsContent>

        <TabsContent value="custom" className="space-y-4">
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="custom-avatar-url" className="flex items-center gap-2">
                <LinkIcon className="h-4 w-4" />
                Avatar URL
              </Label>
              <Input
                id="custom-avatar-url"
                type="url"
                placeholder="https://example.com/avatar.jpg"
                value={customUrl}
                onChange={(e) => handleCustomUrlChange(e.target.value)}
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Provide a direct link to your profile picture
              </p>
            </div>

            <div className="flex items-center gap-2">
              <div className="h-px flex-1 bg-border" />
              <span className="text-xs text-muted-foreground">or</span>
              <div className="h-px flex-1 bg-border" />
            </div>

            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => {
                // Trigger file upload (future enhancement)
                alert('File upload feature coming soon. For now, please use an image URL.');
              }}
            >
              <Upload className="mr-2 h-4 w-4" />
              Upload Image
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              JPG, PNG or GIF (max 2MB)
            </p>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
