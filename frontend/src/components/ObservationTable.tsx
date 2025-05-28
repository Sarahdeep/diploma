import React from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Pencil, Trash2 } from 'lucide-react';
import type { ObservationRead, Species } from '@/types/api'; // Assuming Species is also needed or part of ObservationRead

interface ObservationTableProps {
  observations: ObservationRead[];
  speciesList: Species[]; // For the edit modal
  isLoading: boolean;
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onEdit: (observation: ObservationRead) => void;
  onDelete: (observation: ObservationRead) => void;
  readOnly?: boolean; // Added readOnly prop
}

export function ObservationTable({
  observations,
  isLoading,
  currentPage,
  totalPages,
  onPageChange,
  onEdit,
  onDelete,
  readOnly = false, // Default to false
}: ObservationTableProps) {

  const generatePaginationItems = (currentPage: number, totalPages: number, pageNeighbours: number = 1) => {
    const totalNumbers = (pageNeighbours * 2) + 3; // pageNeighbours on each side + first + current + last
    const totalBlocks = totalNumbers + 2; // For two ellipses

    if (totalPages <= totalBlocks) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }

    const startPage = Math.max(2, currentPage - pageNeighbours);
    const endPage = Math.min(totalPages - 1, currentPage + pageNeighbours);
    let pages: (number | string)[] = [1];

    if (startPage > 2) {
      pages.push('...');
    }

    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }

    if (endPage < totalPages - 1) {
      pages.push('...');
    }

    pages.push(totalPages);
    return pages;
  };

  if (isLoading) {
    return <p>Загрузка наблюдений...</p>;
  }

  if (!observations || observations.length === 0) {
    return <p>Нет наблюдений для отображения.</p>;
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>ID</TableHead>
            <TableHead>Фото</TableHead>
            <TableHead>Вид</TableHead>
            <TableHead>Уверенность</TableHead>
            <TableHead>Дата</TableHead>
            <TableHead>Местоположение</TableHead>
            {!readOnly && <TableHead>Действия</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {observations.map(obs => (
            <TableRow key={obs.id}>
              <TableCell>{obs.id}</TableCell>
              <TableCell>
                <img 
                  src={obs.image_url || 'https://via.placeholder.com/50'} 
                  alt={`Obs ${obs.id}`} 
                  className="h-10 w-10 object-cover" 
                  onError={(e) => (e.currentTarget.src = 'https://via.placeholder.com/50')} // Fallback for broken links
                />
              </TableCell>
              <TableCell>{obs.species ? obs.species.name : "Неизвестный вид"}</TableCell>              <TableCell>{obs.classification_confidence ? (obs.classification_confidence * 100).toFixed(1) + '%' : 'N/A'}</TableCell>
              <TableCell>{new Date(obs.timestamp).toLocaleString()}</TableCell>
              <TableCell>{obs.location ? `${obs.location.coordinates[1].toFixed(4)}, ${obs.location.coordinates[0].toFixed(4)}` : 'N/A'}</TableCell>
              {!readOnly && (
                <TableCell className="space-x-1">
                  <Button variant="outline" size="sm" onClick={() => onEdit(obs)}><Pencil size={14}/></Button>
                  <Button variant="destructive" size="sm" onClick={() => onDelete(obs)}><Trash2 size={14}/></Button>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {/* Pagination UI */}
      {totalPages > 0 && (
        <div className="flex justify-center items-center mt-4 space-x-2">
          <Button 
            variant="outline"
            size="sm"
            onClick={() => onPageChange(Math.max(1, currentPage - 1))} 
            disabled={currentPage === 1}
          >
            ← Prev
          </Button>
          {generatePaginationItems(currentPage, totalPages).map((item, index) => {
            if (typeof item === 'string') {
              return <span key={`ellipsis-${index}`} className="px-2 py-1 text-sm">{item}</span>;
            }
            return (
              <Button 
                key={item}
                variant={item === currentPage ? 'default' : 'outline'}
                size="sm"
                onClick={() => onPageChange(item)}
                disabled={item === currentPage}
              >
                {item}
              </Button>
            );
          })}
          <Button 
            variant="outline"
            size="sm"
            onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))} 
            disabled={currentPage === totalPages || totalPages === 0}
          >
            Next →
          </Button>
        </div>
      )}
    </>
  );
} 