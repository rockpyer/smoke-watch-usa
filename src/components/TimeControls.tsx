import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Play, Pause, SkipBack, SkipForward, RotateCcw } from 'lucide-react';
import { format, addHours } from 'date-fns';

interface TimeControlsProps {
  onTimeChange?: (time: Date, index: number) => void;
  autoPlay?: boolean;
  availableTimes?: Date[];
  timeZone?: string;
}

const TimeControls: React.FC<TimeControlsProps> = ({ onTimeChange, autoPlay = false, availableTimes = [], timeZone }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(autoPlay);
  const [forecastTimes, setForecastTimes] = useState<Date[]>([]);

  // Find the index of the timestamp closest to the target time
  const findClosestIndex = (times: Date[], target: Date) => {
    if (times.length === 0) return 0;
    let closest = 0;
    let minDiff = Math.abs(times[0].getTime() - target.getTime());
    for (let i = 1; i < times.length; i++) {
      const diff = Math.abs(times[i].getTime() - target.getTime());
      if (diff < minDiff) {
        minDiff = diff;
        closest = i;
      }
    }
    return closest;
  };
useEffect(() => {
  if (availableTimes.length > 0) {
    // Use actual smoke data timestamps
    console.log('🕐 TIME CONTROLS: Using available smoke data timestamps:', availableTimes.map(t => t.toISOString()));
    setForecastTimes([...availableTimes]);
    // Snap to current time (closest timestamp)
    const idx = findClosestIndex(availableTimes, new Date());
    setCurrentIndex(idx);
  } else {
    // Fallback: Generate forecast times (current time + 72 hours, 3-hour intervals)
    console.log('🕐 TIME CONTROLS: No available times, generating fallback times');
    const times: Date[] = [];
    const startTime = new Date();
    startTime.setMinutes(0, 0, 0); // Round to nearest hour
    for (let i = 0; i <= 24; i++) { // 72 hours / 3 hour intervals = 24 steps
      times.push(addHours(startTime, i * 3));
    }
    setForecastTimes(times);
    const idx = findClosestIndex(times, new Date());
    setCurrentIndex(idx);
  }
}, [availableTimes]);

  useEffect(() => {
    if (forecastTimes.length > 0 && onTimeChange) {
      console.log(`🕐 TIME CONTROLS: Setting selectedTime to ${forecastTimes[currentIndex].toISOString()} (index ${currentIndex})`);
      onTimeChange(forecastTimes[currentIndex], currentIndex);
    }
  }, [currentIndex, forecastTimes, onTimeChange]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (isPlaying && forecastTimes.length > 0) {
      interval = setInterval(() => {
        setCurrentIndex((prev) => {
          const next = prev + 1;
          if (next >= forecastTimes.length) {
            setIsPlaying(false);
            return 0;
          }
          return next;
        });
      }, 1000); // Change frame every second
    }
    
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isPlaying, forecastTimes.length]);

  const handleSliderChange = (values: number[]) => {
    const newIndex = values[0];
    setCurrentIndex(newIndex);
    setIsPlaying(false);
  };

  const handlePlay = () => {
    setIsPlaying(!isPlaying);
  };

  const handleStepBack = () => {
    setCurrentIndex(Math.max(0, currentIndex - 1));
    setIsPlaying(false);
  };

  const handleStepForward = () => {
    setCurrentIndex(Math.min(forecastTimes.length - 1, currentIndex + 1));
    setIsPlaying(false);
  };

  const handleReset = () => {
    setCurrentIndex(0);
    setIsPlaying(false);
  };

  if (forecastTimes.length === 0) {
    return null;
  }

const currentTime = forecastTimes[currentIndex];
const nowIndex = findClosestIndex(forecastTimes, new Date());
const isCurrentTime = currentIndex === nowIndex;

  return (
    <Card className="bg-background/95 backdrop-blur-sm border shadow-lg">
      <div className="p-4 space-y-4">
        {/* Current Time Display */}
        <div className="text-center">
          <div className="text-lg font-bold text-foreground">
            {currentTime.toLocaleString('en-US', {
              month: 'short',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
              hour12: true,
              timeZone: timeZone || 'America/Denver'
            })}
          </div>
          <div className="text-sm text-muted-foreground">
            {isCurrentTime ? 'Current Conditions' : `Forecast Time`}
          </div>
        </div>

        {/* Timeline Slider */}
        <div className="space-y-2">
          <Slider
            value={[currentIndex]}
            onValueChange={handleSliderChange}
            max={forecastTimes.length - 1}
            min={0}
            step={1}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Now</span>
            <span>+{forecastTimes.length - 1}h</span>
          </div>
        </div>

        {/* Playback Controls */}
        <div className="flex items-center justify-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleReset}
            className="h-8 w-8 p-0"
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
          
          <Button
            variant="outline"
            size="sm"
            onClick={handleStepBack}
            disabled={currentIndex === 0}
            className="h-8 w-8 p-0"
          >
            <SkipBack className="h-4 w-4" />
          </Button>
          
          <Button
            variant="default"
            size="sm"
            onClick={handlePlay}
            className="h-8 w-12 p-0"
          >
            {isPlaying ? (
              <Pause className="h-4 w-4" />
            ) : (
              <Play className="h-4 w-4 ml-0.5" />
            )}
          </Button>
          
          <Button
            variant="outline"
            size="sm"
            onClick={handleStepForward}
            disabled={currentIndex === forecastTimes.length - 1}
            className="h-8 w-8 p-0"
          >
            <SkipForward className="h-4 w-4" />
          </Button>
        </div>

        {/* Time Labels */}
        <div className="text-center text-xs text-muted-foreground">
          Frame {currentIndex + 1} of {forecastTimes.length}
        </div>
      </div>
    </Card>
  );
};

export default TimeControls;