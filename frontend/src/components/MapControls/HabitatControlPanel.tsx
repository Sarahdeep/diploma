// src/components/MapControls/HabitatControlPanel.tsx
import React from 'react';
import { Button, Form, InputNumber, Card, Spin } from 'antd';
import { Species } from '@/types/map';

interface HabitatControlPanelProps {
  selectedSpeciesIds: number[];
  isLoadingPreview: boolean;
  mcpInputParams: { percentage: number };
  kdeInputParams: {
    h_meters: number;
    level_percent: number;
    grid_size: number;
  };
  onMcpParamsChange: (value: number | null) => void;
  onKdeParamsChange: (field: 'h_meters' | 'level_percent' | 'grid_size', value: number | null) => void;
  onCalculateHabitat: (method: 'MCP' | 'KDE') => void;
  isOverallLoading: boolean;
}

/**
 * Панель управления расчётом ареала (MCP / KDE)
 */
const HabitatControlPanel: React.FC<HabitatControlPanelProps> = ({
  selectedSpeciesIds,
  isLoadingPreview,
  mcpInputParams,
  kdeInputParams,
  onMcpParamsChange,
  onKdeParamsChange,
  onCalculateHabitat,
  isOverallLoading
}) => {
  const [form] = Form.useForm();

  return (
    <div style={{ marginTop: '20px', borderTop: '1px solid #eee', paddingTop: '20px' }}>
      <h4 style={{ marginBottom: '10px' }}>Расчет ареала</h4>
      <p style={{fontSize: '0.9em', color: 'gray', marginBottom: '10px'}}>
        {selectedSpeciesIds.length === 0 ? 'Выберите вид из списка выше.' : 
         selectedSpeciesIds.length === 1 ? 'Расчет ареала для выбранного вида.' :
         'Расчет ареала для первого выбранного вида.'}
      </p>
      
      <Form form={form} layout="vertical">
        <Form.Item label="Параметры MCP (% точек)">
          <InputNumber 
            style={{ width: '100%' }}
            min={1} max={100} 
            value={mcpInputParams.percentage} 
            onChange={onMcpParamsChange}
          />
        </Form.Item>
        <Button 
          onClick={() => onCalculateHabitat('MCP')}
          style={{ width: '100%', marginBottom: '10px' }} 
          disabled={selectedSpeciesIds.length === 0 || isLoadingPreview}
        >
          Подсчет MCP
        </Button>

        <Form.Item label="Параметры KDE (радиус h, метры)"> 
          <InputNumber 
            style={{ width: '100%' }}
            min={100} max={100000} step={100}
            value={kdeInputParams.h_meters} 
            onChange={(value) => onKdeParamsChange('h_meters', value)}
            addonAfter="м"
          />
        </Form.Item>
        <Form.Item label="Параметры KDE (уровень %)">
          <InputNumber 
            style={{ width: '100%' }} 
            min={1} max={99} 
            value={kdeInputParams.level_percent} 
            onChange={(value) => onKdeParamsChange('level_percent', value)}
          />
        </Form.Item>
        <Form.Item label="Параметры KDE (размер сетки)">
          <InputNumber 
            style={{ width: '100%' }} 
            min={50} max={500} step={10}
            value={kdeInputParams.grid_size} 
            onChange={(value) => onKdeParamsChange('grid_size', value)}
          />
        </Form.Item>
        <Button 
          onClick={() => onCalculateHabitat('KDE')}
          style={{ width: '100%', marginBottom: '20px' }} 
          disabled={selectedSpeciesIds.length === 0 || isLoadingPreview}
        >
          Подсчет KDE
        </Button>
      </Form>

      <Button
        type="primary"
        onClick={() => onCalculateHabitat('MCP')}
        disabled={!selectedSpeciesIds.length || selectedSpeciesIds.length > 1}
        style={{ width: '100%' }}
      >
        Рассчитать ареал
      </Button>
    </div>
  );
};

export default HabitatControlPanel;
