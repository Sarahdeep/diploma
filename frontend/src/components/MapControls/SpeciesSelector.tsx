// src/components/MapControls/SpeciesSelector.tsx
import React from 'react';
import { Select } from 'antd';
import type { Species } from '@/types/map';

interface SpeciesSelectorProps {
  speciesList: Species[];
  selectedSpeciesIds: number[];
  onChange: (ids: number[]) => void;
  loading?: boolean;
}

/**
 * Компонент для выбора видов (множественный выбор)
 */
const SpeciesSelector: React.FC<SpeciesSelectorProps> = ({
  speciesList,
  selectedSpeciesIds,
  onChange,
  loading = false,
}) => (
  <div style={{ marginBottom: 16 }}>
    <label htmlFor="species-select" style={{ display: 'block', marginBottom: 4 }}>Виды:</label>
    <Select
      id="species-select"
      mode="multiple"
      allowClear
      placeholder="Выберите виды"
      value={selectedSpeciesIds}
      onChange={onChange}
      loading={loading}
      style={{ width: '100%' }}
      maxTagCount="responsive"
    >
      {speciesList.map(species => (
        <Select.Option key={species.id} value={species.id}>
          {species.name}
        </Select.Option>
      ))}
    </Select>
  </div>
);

export default SpeciesSelector;