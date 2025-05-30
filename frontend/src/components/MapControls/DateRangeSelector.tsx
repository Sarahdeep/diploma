// src/components/MapControls/DateRangeSelector.tsx
import React from 'react';
import { DatePicker } from 'antd';
import type { RangePickerProps } from 'antd/es/date-picker';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';

const { RangePicker } = DatePicker;

interface DateRangeSelectorProps {
  value?: [string, string] | null;
  onChange: (dates: RangePickerProps['value'], dateStrings: [string, string]) => void;
}

/**
 * Компонент для выбора диапазона дат
 */
const DateRangeSelector: React.FC<DateRangeSelectorProps> = ({ value, onChange }) => {
  const antDValue: [Dayjs | null, Dayjs | null] | null = value ? [value[0] ? dayjs(value[0]) : null, value[1] ? dayjs(value[1]) : null] : null;

  return (
    <div>
      <label 
        htmlFor="date-range-picker" 
        className="text-sm font-medium block mb-1"
      >
        Период наблюдений:
      </label>
      <RangePicker
        id="date-range-picker"
        value={antDValue as RangePickerProps['value']}
        onChange={onChange}
        style={{ width: '100%' }}
      />
    </div>
  );
};

export default DateRangeSelector;