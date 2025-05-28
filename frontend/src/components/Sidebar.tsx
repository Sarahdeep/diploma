import React from 'react';
import { Button } from '@/components/ui/button';
import { ListTree, UploadCloud, Settings, Map, UserCircle } from 'lucide-react';

interface SidebarProps {
  active: 'upload' | 'observations' | 'analysis' | 'map' | 'profile';
  onSelect: (section: SidebarProps['active']) => void;
  isAdmin?: boolean;
}

export function Sidebar({ active, onSelect, isAdmin }: SidebarProps) {
  const allItems: { key: SidebarProps['active']; icon: React.ReactNode; label: string }[] = [
    { key: 'upload', icon: <UploadCloud className="mr-2 h-4 w-4" />, label: 'Администрирование' },
    { key: 'observations', icon: <ListTree className="mr-2 h-4 w-4" />, label: 'Наблюдения' },
    { key: 'analysis', icon: <Settings className="mr-2 h-4 w-4" />, label: 'Анализ' },
    { key: 'map', icon: <Map className="mr-2 h-4 w-4" />, label: 'Карта' },
    { key: 'profile', icon: <UserCircle className="mr-2 h-4 w-4" />, label: 'Профиль' },
  ];

  const visibleItems = isAdmin ? allItems : allItems.filter(item => item.key !== 'upload');

  return (
    <aside className="w-64 h-full bg-muted p-4 flex flex-col space-y-2">
      {visibleItems.map(item => (
        <Button
          key={item.key}
          variant={active === item.key ? 'secondary' : 'ghost'}
          className="justify-start w-full text-left"
          onClick={() => onSelect(item.key)}
        >
          {item.icon}
          {item.label}
        </Button>
      ))}
    </aside>
  );
}
