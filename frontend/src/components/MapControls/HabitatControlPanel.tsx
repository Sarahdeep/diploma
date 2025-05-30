// src/components/MapControls/HabitatControlPanel.tsx
import React from 'react';
import { Button, Form, InputNumber, Card, Spin } from 'antd';
import InfoIcon from '@/components/ui/InfoIcon';

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

  // Descriptions for InfoIcons
  const mcpDescription = "Минимальный выпуклый многоугольник (MCP) – это наименьший многоугольник, охватывающий все точки наблюдений. Параметр определяет процент наиболее центральных точек, используемых для построения.";
  const mcpMethodDescription = "Рассчитать ареал методом минимального выпуклого многоугольника. Этот метод прост, но может включать большие области неиспользуемого пространства.";
  const kdeHDescription = "Оценка плотности ядер (KDE) – метод, оценивающий распределение вероятностей. 'Радиус h (bandwidth)' – это радиус сглаживания для функции ядра, влияет на гладкость оценки ареала. Указывается в метрах.";
  const kdeLevelDescription = "Уровень контура вероятности (например, 50% или 95%), используемый для определения границы ареала. Означает, что указанный процент объема распределения вероятностей находится внутри этого контура.";
  const kdeGridDescription = "Размер ячейки сетки, на которой рассчитывается плотность. Меньшие значения дают более точный, но более ресурсоемкий расчет.";
  const kdeMethodDescription = "Рассчитать ареал методом оценки плотности ядер. Этот метод может лучше отражать фактическое использование пространства видом, выделяя области высокой концентрации.";
  const habitatCalculationTitleDescription = "Методы оценки области географического распространения вида на основе точек наблюдений.";

  return (
    <div style={{ marginTop: '20px', borderTop: '1px solid #eee', paddingTop: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '10px' }}>
        <h4 style={{ marginRight: '8px' }}>Расчет ареала</h4>
        <InfoIcon description={habitatCalculationTitleDescription} />
      </div>
      <p style={{fontSize: '0.9em', color: 'gray', marginBottom: '10px'}}>
        {selectedSpeciesIds.length === 0 ? 'Выберите вид из списка выше.' : 
         selectedSpeciesIds.length > 0 ? 'Расчет ареала для выбранных видов.' : ''}
      </p>
      
      <Form form={form} layout="vertical">
        <Form.Item 
          label={
            <div style={{ display: 'flex', alignItems: 'center' }}>
              Параметры MCP (% точек)
              <InfoIcon description={mcpDescription} />
            </div>
          }
        >
          <InputNumber 
            style={{ width: '100%' }}
            min={1} max={100} 
            value={mcpInputParams.percentage} 
            onChange={onMcpParamsChange}
            disabled={isLoadingPreview}
          />
        </Form.Item>
        <Button 
          onClick={() => onCalculateHabitat('MCP')}
          style={{ width: '100%', marginBottom: '10px' }} 
          disabled={selectedSpeciesIds.length === 0 || isLoadingPreview}
        >
          Подсчет MCP
          <InfoIcon description={mcpMethodDescription} className="inline-block align-middle" />
        </Button>

        <Form.Item 
          label={
            <div style={{ display: 'flex', alignItems: 'center' }}>
              Параметры KDE (радиус h, метры)
              <InfoIcon description={kdeHDescription} />
            </div>
          }
        > 
          <InputNumber 
            style={{ width: '100%' }}
            min={100} max={100000} step={100}
            value={kdeInputParams.h_meters} 
            onChange={(value) => onKdeParamsChange('h_meters', value)}
            addonAfter="м"
            disabled={isLoadingPreview}
          />
        </Form.Item>
        <Form.Item 
          label={
            <div style={{ display: 'flex', alignItems: 'center' }}>
              Параметры KDE (уровень %)
              <InfoIcon description={kdeLevelDescription} />
            </div>
          }
        >
          <InputNumber 
            style={{ width: '100%' }} 
            min={1} max={99} 
            value={kdeInputParams.level_percent} 
            onChange={(value) => onKdeParamsChange('level_percent', value)}
            disabled={isLoadingPreview}
          />
        </Form.Item>
        <Form.Item 
          label={
            <div style={{ display: 'flex', alignItems: 'center' }}>
              Параметры KDE (размер сетки)
              <InfoIcon description={kdeGridDescription} />
            </div>
          }
        >
          <InputNumber 
            style={{ width: '100%' }} 
            min={50} max={500} step={10}
            value={kdeInputParams.grid_size} 
            onChange={(value) => onKdeParamsChange('grid_size', value)}
            disabled={isLoadingPreview}
          />
        </Form.Item>
        <Button 
          onClick={() => onCalculateHabitat('KDE')}
          style={{ width: '100%', marginBottom: '20px' }} 
          disabled={selectedSpeciesIds.length === 0 || isLoadingPreview}
        >
          Подсчет KDE
          <InfoIcon description={kdeMethodDescription} className="inline-block align-middle" />
        </Button>
      </Form>
    </div>
  );
};

export default HabitatControlPanel;
