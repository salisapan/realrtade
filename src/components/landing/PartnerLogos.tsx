import { useRef, useEffect } from 'react';
const partners = [{
  id: 1,
  name: "Blackstone",
  logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/1/14/Blackstone_Group_logo.svg/320px-Blackstone_Group_logo.svg.png"
}, {
  id: 2,
  name: "CBRE Group",
  logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d6/CBRE_Group_logo.svg/320px-CBRE_Group_logo.svg.png"
}, {
  id: 3,
  name: "JLL",
  logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2c/JLL_logo.svg/320px-JLL_logo.svg.png"
}, {
  id: 4,
  name: "Goldman Sachs",
  logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/6/61/Goldman_Sachs.svg/320px-Goldman_Sachs.svg.png"
}, {
  id: 5,
  name: "JPMorgan",
  logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/af/J.P._Morgan_Logo_2008_1.svg/320px-J.P._Morgan_Logo_2008_1.svg.png"
}, {
  id: 6,
  name: "Carlyle Group",
  logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/9/9d/The_Carlyle_Group_logo.svg/320px-The_Carlyle_Group_logo.svg.png"
}];
export const PartnerLogos = () => {
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const scrollContainer = scrollRef.current;
    if (!scrollContainer) return;
    const scrollWidth = scrollContainer.scrollWidth;
    const clientWidth = scrollContainer.clientWidth;
    if (scrollWidth <= clientWidth) return;
    let scrollPosition = 0;
    const scrollSpeed = 0.5;
    const scroll = () => {
      scrollPosition += scrollSpeed;

      // Reset position when we've scrolled through the content once
      if (scrollPosition >= scrollWidth / 2) {
        scrollPosition = 0;
      }
      if (scrollContainer) {
        scrollContainer.scrollLeft = scrollPosition;
      }
      requestAnimationFrame(scroll);
    };
    const animationId = requestAnimationFrame(scroll);
    return () => cancelAnimationFrame(animationId);
  }, []);
  return;
};