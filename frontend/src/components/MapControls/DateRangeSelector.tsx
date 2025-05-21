// src/components/MapControls/DateRangeSelector.tsx
import React from 'react';
import { DatePicker } from 'antd';
import type { RangePickerProps } from 'antd/es/date-picker';

const { RangePicker } = DatePicker;

interface DateRangeSelectorProps {
  value?: [string, string] | null;
  onChange: (dates: RangePickerProps['value'], dateStrings: [string, string]) => void;
}

/**
 * Компонент для выбора диапазона дат
 */
const DateRangeSelector: React.FC<DateRangeSelectorProps> = ({ value, onChange }) => (
  <div style={{ marginBottom: 16 }}>
    <label htmlFor="date-range-picker" style={{ display: 'block', marginBottom: 4 }}>
      Период наблюдений:
    </label>
    <RangePicker
      id="date-range-picker"
      value={value as any}
      onChange={onChange}
      style={{ width: '100%' }}
    />
  </div>
);

export default DateRangeSelector;