// src/components/MapControls/MapControls.tsx
import React from 'react';
import { Card, Spin } from 'antd';
import type { RangePickerProps } from 'antd/es/date-picker';
import SpeciesSelector from './SpeciesSelector';
import DateRangeSelector from './DateRangeSelector';
import HabitatControlPanel from './HabitatControlPanel';
import type { Species } from '@/types/map';

interface MapControlsProps {
  // Species selector
  speciesList: Species[];
  selectedSpeciesIds: number[];
  onSpeciesChange: (ids: number[]) => void;
  loadingSpecies?: boolean;

  // Date range
  dateRange: [string, string];
  onDateRangeChange: (
    dates: RangePickerProps['value'],
    dateStrings: [string, string]
  ) => void;

  // Habitat controls
  mcpInputParams: { percentage: number };
  kdeInputParams: {
    h_meters: number;
    level_percent: number;
    grid_size: number;
  };
  onMcpParamsChange: (value: number | null) => void;
  onKdeParamsChange: (field: 'h_meters' | 'level_percent' | 'grid_size', value: number | null) => void;
  onCalculateHabitat: (method: 'MCP' | 'KDE') => void;
  isLoadingPreview: boolean;

  // Overall loading state for controls
  isOverallLoading?: boolean;
}

/**
 * Компоновщик всех контролов для карты:
 * выбор видов, период наблюдений, расчёт ареалов
 */
const MapControls: React.FC<MapControlsProps> = ({
  speciesList,
  selectedSpeciesIds,
  onSpeciesChange,
  loadingSpecies = false,

  dateRange,
  onDateRangeChange,

  mcpInputParams,
  kdeInputParams,
  onMcpParamsChange,
  onKdeParamsChange,
  onCalculateHabitat,
  isLoadingPreview,

  isOverallLoading = false,
}) => (
  <Card title="Map Controls" size="small" style={{ borderRadius: 8 }}>
    <Spin spinning={isOverallLoading}>
      <SpeciesSelector
        speciesList={speciesList}
        selectedSpeciesIds={selectedSpeciesIds}
        onChange={onSpeciesChange}
        loading={loadingSpecies}
      />

      <DateRangeSelector
        value={dateRange}
        onChange={onDateRangeChange}
      />

      <HabitatControlPanel
        selectedSpeciesIds={selectedSpeciesIds}
        isLoadingPreview={isLoadingPreview}
        mcpInputParams={mcpInputParams}
        kdeInputParams={kdeInputParams}
        onMcpParamsChange={onMcpParamsChange}
        onKdeParamsChange={onKdeParamsChange}
        onCalculateHabitat={onCalculateHabitat}
        isOverallLoading={isOverallLoading}
      />
    </Spin>
  </Card>
);

export default MapControls;
