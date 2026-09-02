interface TimelineEvent {
  year: string;
  title: string;
  description: string;
}

interface TimelineComponentProps {
  events: TimelineEvent[];
}

export const TimelineComponent = ({ events }: TimelineComponentProps) => {
  return (
    <div className="space-y-8">
      {events.map((event, index) => (
        <div key={index} className="flex gap-4">
          <div className="flex flex-col items-center">
            <div className="w-4 h-4 rounded-full bg-gradient-to-br from-primary to-secondary" />
            {index < events.length - 1 && (
              <div className="w-1 h-16 bg-gradient-to-b from-primary/50 to-transparent mt-2" />
            )}
          </div>
          <div className="pb-4 flex-1">
            <div className="flex items-baseline gap-2">
              <span className="font-bold text-primary text-lg">{event.year}</span>
              <h3 className="font-semibold text-foreground">{event.title}</h3>
            </div>
            <p className="text-sm text-foreground/60 mt-1">{event.description}</p>
          </div>
        </div>
      ))}
    </div>
  );
};
