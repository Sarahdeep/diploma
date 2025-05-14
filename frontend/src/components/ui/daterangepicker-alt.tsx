'use client'

import * as React from "react"
import { format } from "date-fns"
import { Calendar as CalendarIcon } from "lucide-react"
import { DateRange } from "react-day-picker"
import { ControllerRenderProps } from "react-hook-form"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { cn } from "@/lib/utils"

interface DatePickerWithRangeAlternativeProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onChange'> {
  field: ControllerRenderProps<any, 'dateRange'>;
  disabled?: boolean;
}

export function DatePickerWithRangeAlternative({
  className,
  field,
  disabled = false
}: DatePickerWithRangeAlternativeProps) {
  // Состояние для контроля отображения календаря
  const [isOpen, setIsOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  // Ensure date is correctly formatted as DateRange for the Calendar component
  const date: DateRange | undefined = field?.value ? 
    { from: field.value.from || undefined, to: field.value.to || undefined } : 
    undefined;

  // Обработчик клика
  const handleButtonClick = (e: React.MouseEvent) => {
    console.log('Button clicked');
    // Предотвращаем всплытие события и действие по умолчанию
    e.preventDefault();
    e.stopPropagation();
    setIsOpen(!isOpen);
  };

  // Обработчик клика вне компонента для закрытия календаря
  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  return (
    <div className={cn("relative", className)} ref={containerRef}>
      <Button
        id="date"
        type="button"
        variant={"outline"}
        className={cn(
          "w-full justify-start text-left font-normal",
          !field?.value && "text-muted-foreground"
        )}
        disabled={disabled}
        onClick={handleButtonClick}
      >
        <CalendarIcon className="mr-2 h-4 w-4" />
        {date?.from ? (
          date.to ? (
            <>
              {format(date.from, "LLL dd, y")} -{" "}
              {format(date.to, "LLL dd, y")}
            </>
          ) : (
            format(date.from, "LLL dd, y")
          )
        ) : (
          <span>Выберите диапазон дат</span>
        )}
      </Button>
      
      {isOpen && (
        <div 
          className="absolute left-0 top-[calc(100%+4px)] w-auto bg-white rounded-md shadow-lg border border-gray-200 z-[9999]"
          style={{ 
            minWidth: '300px',
            maxWidth: '600px'
          }}
        >
          <div className="p-2">
            <Calendar
              initialFocus
              mode="range"
              defaultMonth={date?.from}
              selected={date}
              onSelect={(selectedDate) => {
                console.log('Calendar selected:', selectedDate);
                field?.onChange(selectedDate);
                // Закрываем попап только когда выбран полный диапазон
                if (selectedDate?.from && selectedDate?.to) {
                  setIsOpen(false);
                }
              }}
              numberOfMonths={2}
              disabled={disabled}
            />
          </div>
        </div>
      )}
    </div>
  );
} 