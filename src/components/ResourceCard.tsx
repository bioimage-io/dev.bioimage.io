import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Resource } from '../types';
import { Card, CardMedia, CardContent, IconButton } from '@mui/material';

interface ResourceCardProps {
  resource: Resource;
}

export const ResourceCard: React.FC<ResourceCardProps> = ({ resource }) => {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const covers = resource.manifest.covers || [];
  const navigate = useNavigate();

  const nextImage = (e: React.MouseEvent) => {
    e.preventDefault(); // Prevent Link navigation
    setCurrentImageIndex((prev) => (prev + 1) % covers.length);
  };

  const previousImage = (e: React.MouseEvent) => {
    e.preventDefault(); // Prevent Link navigation
    setCurrentImageIndex((prev) => (prev - 1 + covers.length) % covers.length);
  };

  const handleClick = () => {
    const id = resource.id.split('/').pop();
    navigate(`/resources/${id}`);
  };

  return (
    <Card 
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        border: '1px solid rgba(0, 0, 0, 0.12)',
        boxShadow: '0 2px 4px rgba(0, 0, 0, 0.08)',
        cursor: 'pointer',
        '&:hover': {
          boxShadow: '0 4px 8px rgba(0, 0, 0, 0.12)',
          transform: 'translateY(-2px)',
          transition: 'all 0.2s ease-in-out'
        }
      }}
      onClick={handleClick}
    >
      <div style={{ position: 'relative', paddingTop: '56.25%' }}> {/* 16:9 aspect ratio container */}
        <CardMedia
          component="img"
          image={covers[currentImageIndex] || '/placeholder-image.png'}
          alt={resource.manifest.name}
          sx={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            borderBottom: '1px solid rgba(0, 0, 0, 0.12)'
          }}
        />
      </div>
      <CardContent sx={{ flexGrow: 1, p: 2 }}>
        <div className="flex items-start gap-3 mb-3">
          <div className="flex-shrink-0 w-8">
            {resource.manifest.icon ? (
              <img
                src={resource.manifest.icon}
                alt={resource.manifest.name}
                className="w-8 h-8 object-contain"
              />
            ) : resource.manifest.id_emoji ? (
              <span className="text-2xl">{resource.manifest.id_emoji}</span>
            ) : (
              <div className="w-8 h-8 bg-gray-200 rounded-full" />
            )}
          </div>
          <h3 className="text-base font-medium text-gray-900 break-words flex-grow truncate max-w-[calc(100%-2.5rem)]">
            {resource.manifest.name}
          </h3>
          
        </div>
        
        <p className="text-sm text-gray-600 mb-4 line-clamp-2 flex-grow">
          {resource.manifest.description}
        </p>
        <div className="space-y-2">
          {/* Tags */}
          <div className="flex flex-wrap gap-1.5">
            {resource.manifest.tags?.slice(0, 3).map((tag: string) => (
              <span
                key={tag}
                className="px-2 py-0.5 bg-gray-50 text-gray-600 text-xs rounded-full border border-gray-100"
              >
                {tag}
              </span>
            ))}
          </div>
          {/* Badges */}
          <div className="flex flex-wrap gap-1.5">
            {resource.manifest.badges?.map((badge) => (
              <a
                key={badge.url}
                href={badge.url}
                target="_blank"
                rel="noopener noreferrer"
                className="px-2 py-0.5 bg-blue-50 text-blue-600 text-xs rounded-full border border-blue-100 flex items-center gap-1 hover:bg-blue-100 transition-colors"
              >
                {badge.icon && <img src={badge.icon} alt="" className="h-4" />}
                {badge.label}
              </a>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default ResourceCard; 