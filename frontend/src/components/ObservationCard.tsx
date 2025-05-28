import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { ObservationRead } from '@/types/api';
import { userService, type AuthorInfo } from '@/services/userService';

interface ObservationCardProps {
  observation: ObservationRead;
  onLocationClick: (lat: number, lng: number) => void;
  onAuthorClick?: (authorId: string) => void;
}

// Mock authors data - in a real app this would come from the backend
// const mockAuthors = {
//   'user1': { name: 'Иван Петров', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=user1' },
//   'user2': { name: 'Мария Сидорова', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=user2' },
//   'user3': { name: 'Алексей Иванов', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=user3' },
// };

export function ObservationCard({ observation, onLocationClick, onAuthorClick }: ObservationCardProps) {
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  const [author, setAuthor] = useState<AuthorInfo | null>(null);
  const [loadingAuthor, setLoadingAuthor] = useState(true);

  useEffect(() => {
    if (observation.user_id) {
      setLoadingAuthor(true);
      userService.getPublicAuthorInfo(observation.user_id)
        .then(authorData => {
          setAuthor(authorData);
          setLoadingAuthor(false);
        })
        .catch(error => {
          console.error("Failed to fetch public author info for user_id:", observation.user_id, error);
          setAuthor(null);
          setLoadingAuthor(false);
        });
    } else {
      setLoadingAuthor(false);
    }
  }, [observation.user_id]);

  const handleAuthorProfileClick = () => {
    if (author) {
      if (currentUser && author.id === currentUser.id) {
        navigate('/profile');
      } else {
        navigate(`/users/${author.id}/profile`);
      }
    } else if (observation.user_id && onAuthorClick) {
      onAuthorClick(observation.user_id.toString());
    }
  };

  return (
    <Card className="overflow-hidden">
      <CardHeader className="p-3 pb-0 mb-0">
        <CardTitle className="text-base mt-0 mb-0">#{observation.id} – {observation.species ? observation.species.name : "Неизвестный вид"}</CardTitle>
      </CardHeader>
      <div className="relative w-full h-48 p-3 pt-0 mt-[-0.5rem]">
        <img
          src={observation.image_url || ''}
          alt={`Observation ${observation.id}`}
          className="object-cover w-full h-full bg-gray-100"
        />
      </div>
      <CardContent className="p-3 pt-1 space-y-1.5">
        <div className="flex items-center space-x-2">
          {loadingAuthor ? (
            <div className="w-6 h-6 rounded-full bg-gray-300 animate-pulse"></div>
          ) : author ? (
            <img 
              src={author.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=user${author.id}`} 
              alt={author.username} 
              className="w-6 h-6 rounded-full"
            />
          ) : (
            <div className="w-6 h-6 rounded-full bg-gray-400"></div>
          )}
          <Button 
            variant="link" 
            size="sm" 
            className="p-0 h-auto font-normal text-sm"
            onClick={handleAuthorProfileClick}
            disabled={loadingAuthor || !author}
          >
            {loadingAuthor ? "Загрузка..." : author ? author.username : "Неизвестный автор"}
          </Button>
        </div>
        <p className="text-sm"><strong>Время:</strong> {new Date(observation.timestamp).toLocaleString()}</p>
        {observation.classification_confidence !== null && 
         observation.classification_confidence !== undefined && 
         observation.classification_confidence > 0 && (
          <p className="text-sm"><strong>Уверенность:</strong> {(observation.classification_confidence * 100).toFixed(1)}%</p>
        )}
        {observation.location && (
          <Button 
            variant="link" 
            size="sm" 
            className="text-sm"
            onClick={() => onLocationClick(
              observation.location.coordinates[1],
              observation.location.coordinates[0]
            )}
          >
            📍 {observation.location.coordinates[1].toFixed(4)}, {observation.location.coordinates[0].toFixed(4)}
          </Button>
        )}
      </CardContent>
    </Card>
  );
} 