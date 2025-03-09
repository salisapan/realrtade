import { PropertyMap } from "./PropertyMap";
import { RecommendationRating } from "./RecommendationRating";
import { LetterOfIntentForm } from "./LetterOfIntentForm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useEffect, useState, useRef } from "react";
import * as THREE from "three";
import { LandPlot, Percent, DollarSign, Building, CalendarDays, Users, Timer, Map, AreaChartIcon } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell, Legend } from "recharts";

interface PropertyDetailContentProps {
  property: {
    id: string;
    name: string;
    location: string;
    description: string;
    price: number;
    roi: number;
    term: number;
    minInvestment: number;
    daysLeft: number;
    fundingProgress: number;
    currentFunding: number;
    fundingGoal: number;
    investors: number;
    keyFeatures: string[];
    recommendationScore: number;
    marketTrend: string;
    entrepreneurExperience: string;
    riskLevel: string;
    demandLevel: string;
    returnPotential: string;
    [key: string]: any;
  };
}

// Mock data for 3D graphs
const roiTimelineData = [{
  year: '2023',
  expected: 8.2,
  actual: 8.5
}, {
  year: '2024',
  expected: 9.1,
  actual: 9.4
}, {
  year: '2025',
  expected: 10.0,
  actual: 10.3
}, {
  year: '2026',
  expected: 11.2,
  actual: 11.5
}, {
  year: '2027',
  expected: 12.5,
  actual: 0
}, {
  year: '2028',
  expected: 13.8,
  actual: 0
}];
const cashFlowQuarterlyData = [{
  name: 'Q1 2023',
  projected: 45000,
  actual: 47500
}, {
  name: 'Q2 2023',
  projected: 48000,
  actual: 49200
}, {
  name: 'Q3 2023',
  projected: 51000,
  actual: 50800
}, {
  name: 'Q4 2023',
  projected: 55000,
  actual: 56700
}, {
  name: 'Q1 2024',
  projected: 59000,
  actual: 0
}, {
  name: 'Q2 2024',
  projected: 63000,
  actual: 0
}, {
  name: 'Q3 2024',
  projected: 68000,
  actual: 0
}, {
  name: 'Q4 2024',
  projected: 72000,
  actual: 0
}];
const riskAssessmentData = [{
  category: 'Market',
  score: 3.2,
  fullMark: 10
}, {
  category: 'Tenant',
  score: 2.1,
  fullMark: 10
}, {
  category: 'Location',
  score: 1.5,
  fullMark: 10
}, {
  category: 'Building',
  score: 2.8,
  fullMark: 10
}, {
  category: 'Financing',
  score: 4.2,
  fullMark: 10
}];
const COLORS = ['#1EAEDB', '#0088FE', '#0FA0CE', '#33C3F0', '#0070C0'];

const ThreeDGraph = ({
  chartId,
  data,
  type
}: {
  chartId: string;
  data: any[];
  type: 'bar' | 'line' | 'pie';
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!containerRef.current) return;

    // Clear any existing canvas
    const existingCanvas = containerRef.current.querySelector('canvas');
    if (existingCanvas) {
      existingCanvas.remove();
    }

    // Set up the scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0f0f0);

    // Set up the camera
    const camera = new THREE.PerspectiveCamera(75, containerRef.current.clientWidth / containerRef.current.clientHeight, 0.1, 1000);
    camera.position.z = 5;
    camera.position.y = 2;

    // Set up the renderer
    const renderer = new THREE.WebGLRenderer({
      antialias: true
    });
    renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    containerRef.current.appendChild(renderer.domElement);

    // Add a grid helper
    const gridHelper = new THREE.GridHelper(10, 10);
    scene.add(gridHelper);

    // Create chart based on type
    if (type === 'bar') {
      // Create 3D bar chart
      data.forEach((item, index) => {
        const barHeight = item.expected ? item.expected / 2 : item.projected / 20000;
        const geometry = new THREE.BoxGeometry(0.5, barHeight, 0.5);
        const material = new THREE.MeshPhongMaterial({
          color: new THREE.Color(COLORS[index % COLORS.length])
        });
        const bar = new THREE.Mesh(geometry, material);

        // Position each bar
        bar.position.x = index - data.length / 2 + 0.5;
        bar.position.y = barHeight / 2;
        scene.add(bar);

        // Add text label
        const labelDiv = document.createElement('div');
        labelDiv.className = 'chart-label';
        labelDiv.textContent = item.year || item.name;
        labelDiv.style.position = 'absolute';
        labelDiv.style.left = `${index / data.length * 100}%`;
        labelDiv.style.bottom = '5px';
        labelDiv.style.color = '#333';
        labelDiv.style.fontSize = '10px';
        labelDiv.style.fontWeight = 'bold';
        containerRef.current.appendChild(labelDiv);
      });
    } else if (type === 'line') {
      // Create 3D line chart
      const points = [];
      for (let i = 0; i < data.length; i++) {
        const value = data[i].expected || data[i].score;
        points.push(new THREE.Vector3(i - data.length / 2 + 0.5, value / 2, 0));
      }
      const lineGeometry = new THREE.BufferGeometry().setFromPoints(points);
      const lineMaterial = new THREE.LineBasicMaterial({
        color: 0x0088fe,
        linewidth: 2
      });
      const line = new THREE.Line(lineGeometry, lineMaterial);
      scene.add(line);

      // Add spheres at each point
      points.forEach(point => {
        const sphereGeometry = new THREE.SphereGeometry(0.1, 16, 16);
        const sphereMaterial = new THREE.MeshPhongMaterial({
          color: 0x00c49f
        });
        const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
        sphere.position.copy(point);
        scene.add(sphere);
      });
    } else if (type === 'pie') {
      // Create 3D pie chart
      const radius = 2;
      const totalValue = data.reduce((sum, item) => sum + (item.score || 1), 0);
      let startAngle = 0;
      data.forEach((item, index) => {
        const value = item.score || 1;
        const angle = value / totalValue * Math.PI * 2;
        const shape = new THREE.Shape();
        shape.moveTo(0, 0);
        shape.arc(0, 0, radius, startAngle, startAngle + angle, false);
        shape.lineTo(0, 0);
        const extrudeSettings = {
          steps: 1,
          depth: 0.5,
          bevelEnabled: false
        };
        const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
        const material = new THREE.MeshPhongMaterial({
          color: new THREE.Color(COLORS[index % COLORS.length]),
          side: THREE.DoubleSide
        });
        const segment = new THREE.Mesh(geometry, material);
        segment.rotation.x = Math.PI / 2;
        scene.add(segment);
        startAngle += angle;
      });
    }

    // Add lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(1, 1, 1);
    scene.add(directionalLight);

    // Auto-rotate animation
    let rotationSpeed = 0.005;

    // Add controls for interaction
    let isDragging = false;
    let previousMousePosition = {
      x: 0,
      y: 0
    };
    containerRef.current.addEventListener('mousedown', () => {
      isDragging = true;
    });
    containerRef.current.addEventListener('mousemove', e => {
      if (isDragging) {
        const deltaMove = {
          x: e.offsetX - previousMousePosition.x,
          y: e.offsetY - previousMousePosition.y
        };
        scene.rotation.y += deltaMove.x * 0.01;
        scene.rotation.x += deltaMove.y * 0.01;
      }
      previousMousePosition = {
        x: e.offsetX,
        y: e.offsetY
      };
    });
    containerRef.current.addEventListener('mouseup', () => {
      isDragging = false;
    });

    // Animation loop
    const animate = () => {
      requestAnimationFrame(animate);
      if (!isDragging) {
        scene.rotation.y += rotationSpeed;
      }
      renderer.render(scene, camera);
    };
    animate();

    // Handle window resize
    const handleResize = () => {
      if (!containerRef.current) return;
      camera.aspect = containerRef.current.clientWidth / containerRef.current.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    };
    window.addEventListener('resize', handleResize);

    // Cleanup function
    return () => {
      window.removeEventListener('resize', handleResize);
      if (containerRef.current) {
        const labels = containerRef.current.querySelectorAll('.chart-label');
        labels.forEach(label => label.remove());
      }
    };
  }, [chartId, data, type]);
  return <div ref={containerRef} className="graph-3d-container">
      
      
    </div>;
};

export const PropertyDetailContent = ({
  property
}: PropertyDetailContentProps) => {
  const handleScheduleCall = () => {
    window.open('https://calendly.com/realtrade/investment-call', '_blank');
  };

  return <div className="p-4 md:p-6">
      <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-4 mb-6">
        <div>
          <div className="flex items-center flex-wrap gap-2 mb-2">
            <Badge variant="outline" className="bg-primary/10">
              {property.type}
            </Badge>
            <Badge variant="outline" className="bg-primary/10 flex items-center gap-1">
              <Timer className="w-3 h-3" />
              <span>{property.daysLeft} days left</span>
            </Badge>
          </div>
          <h1 className="text-2xl font-bold mb-1">{property.name}</h1>
          <div className="flex items-center text-gray-500 mb-4">
            <Map className="w-4 h-4 mr-1" />
            <span>{property.location}</span>
          </div>
        </div>
        
        <div className="bg-gray-50 rounded-lg p-3 w-full md:w-auto md:min-w-[180px]">
          <div className="flex flex-col gap-2">
            <div>
              <div className="text-xs text-gray-500">Funding Progress</div>
              <div className="flex justify-between items-center mx-0">
                <div className="text-lg font-bold">{property.fundingProgress}%</div>
                <div className="text-xs text-gray-500">
                  ${(property.currentFunding / 1000000).toFixed(1)}M / ${(property.fundingGoal / 1000000).toFixed(1)}M
                </div>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2 mt-1">
                <div 
                  className="bg-primary h-2 rounded-full" 
                  style={{width: `${property.fundingProgress}%`}}
                ></div>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-2 text-center text-xs">
              <div className="bg-white p-2 rounded border">
                <div className="text-gray-500 mb-1">Investors</div>
                <div className="font-bold">{property.investors}</div>
              </div>
              <div className="bg-white p-2 rounded border">
                <div className="text-gray-500 mb-1">Min. Investment</div>
                <div className="font-bold text-gray-800">${(2500).toLocaleString()}</div>
              </div>
            </div>
            
            <LetterOfIntentForm 
              propertyId={property.id} 
              propertyName={property.name} 
              minInvestment={2500} 
            />
          </div>
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          <div>
            <h2 className="text-lg font-bold mb-2">About This Property</h2>
            <p className="text-gray-600">{property.description}</p>
          </div>
          
          <div>
            <h2 className="text-lg font-bold mb-3">Key Investment Metrics</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 property-metrics">
              <div className="bg-gray-50 p-3 rounded-lg">
                <div className="flex items-center gap-2 mb-1">
                  <DollarSign className="w-4 h-4 text-primary" />
                  <span className="text-sm font-medium">Property Value</span>
                </div>
                <div className="text-lg font-bold">${(property.price / 1000000).toFixed(1)}M</div>
              </div>
              
              <div className="bg-gray-50 p-3 rounded-lg">
                <div className="flex items-center gap-2 mb-1">
                  <Percent className="w-4 h-4 text-primary" />
                  <span className="text-sm font-medium">Target ROI</span>
                </div>
                <div className="text-lg font-bold">{property.roi}%</div>
              </div>
              
              <div className="bg-gray-50 p-3 rounded-lg">
                <div className="flex items-center gap-2 mb-1">
                  <CalendarDays className="w-4 h-4 text-primary" />
                  <span className="text-sm font-medium">Term</span>
                </div>
                <div className="text-lg font-bold">{property.term} years</div>
              </div>
              
              <div className="bg-gray-50 p-3 rounded-lg">
                <div className="flex items-center gap-2 mb-1">
                  <Building className="w-4 h-4 text-primary" />
                  <span className="text-sm font-medium">Type</span>
                </div>
                <div className="text-lg font-bold">{property.type}</div>
              </div>
            </div>
          </div>
          
          <div>
            <h2 className="text-lg font-bold mb-3">Key Features</h2>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
              {property.keyFeatures.map((feature, index) => <li key={index} className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <LandPlot className="w-3 h-3 text-primary" />
                  </div>
                  <span className="text-sm">{feature}</span>
                </li>)}
            </ul>
          </div>
          
          <div>
            <h2 className="text-lg font-bold mb-3">Advanced Financial Analysis</h2>
            
            <div className="space-y-6">
              <div className="bg-gray-50 p-4 rounded-lg">
                <h3 className="text-base font-semibold mb-2">Return on Investment Timeline</h3>
                <p className="text-sm text-gray-600 mb-4">
                  This 3D visualization shows the projected ROI over the investment term. The graph compares expected vs. actual returns.
                </p>
                
                {/* Interactive 3D Graph */}
                <ThreeDGraph chartId="roi-timeline" data={roiTimelineData} type="bar" />
                
                {/* 2D Fallback Graph for mobile */}
                <div className="mt-4 md:hidden">
                  <h4 className="text-sm font-medium mb-2">ROI Progression (Mobile View)</h4>
                  <div className="investment-chart">
                    <ResponsiveContainer width="100%" height={200}>
                      <AreaChart data={roiTimelineData} margin={{
                      top: 10,
                      right: 10,
                      left: 0,
                      bottom: 10
                    }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="year" tick={{
                        fontSize: 10
                      }} />
                        <YAxis tick={{
                        fontSize: 10
                      }} />
                        <RechartsTooltip contentStyle={{
                        fontSize: 12
                      }} />
                        <Area type="monotone" dataKey="expected" stackId="1" stroke="#8884d8" fill="#8884d8" name="Expected ROI %" />
                        <Area type="monotone" dataKey="actual" stackId="2" stroke="#82ca9d" fill="#82ca9d" name="Actual ROI %" />
                        <Legend wrapperStyle={{
                        fontSize: 10
                      }} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
              
              <div className="bg-gray-50 p-4 rounded-lg">
                <h3 className="text-base font-semibold mb-2">Quarterly Cash Flow Projections</h3>
                <p className="text-sm text-gray-600 mb-4">
                  This visualization shows the projected quarterly cash flow over time, comparing projections to actual results where available.
                </p>
                
                {/* Interactive 3D Graph */}
                <ThreeDGraph chartId="cash-flow" data={cashFlowQuarterlyData} type="bar" />
                
                {/* 2D Fallback Graph for mobile */}
                <div className="mt-4 md:hidden">
                  <h4 className="text-sm font-medium mb-2">Cash Flow (Mobile View)</h4>
                  <div className="investment-chart">
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={cashFlowQuarterlyData} margin={{
                      top: 10,
                      right: 10,
                      left: 0,
                      bottom: 20
                    }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" angle={-45} textAnchor="end" height={50} tick={{
                        fontSize: 10
                      }} />
                        <YAxis tick={{
                        fontSize: 10
                      }} />
                        <RechartsTooltip contentStyle={{
                        fontSize: 12
                      }} />
                        <Bar dataKey="projected" name="Projected ($)" fill="#8884d8" />
                        <Bar dataKey="actual" name="Actual ($)" fill="#82ca9d" />
                        <Legend wrapperStyle={{
                        fontSize: 10
                      }} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
              
              <div className="bg-gray-50 p-4 rounded-lg">
                <h3 className="text-base font-semibold mb-2">Risk Assessment Analysis</h3>
                <p className="text-sm text-gray-600 mb-4">
                  This comprehensive risk assessment shows different risk factors for this property investment. Lower scores indicate lower risk.
                </p>
                
                {/* Interactive 3D Graph */}
                <ThreeDGraph chartId="risk-analysis" data={riskAssessmentData} type="line" />
                
                {/* 2D Fallback Graph for mobile */}
                <div className="mt-4 md:hidden">
                  <h4 className="text-sm font-medium mb-2">Risk Analysis (Mobile View)</h4>
                  <div className="investment-chart">
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart layout="vertical" data={riskAssessmentData} margin={{
                      top: 10,
                      right: 30,
                      left: 70,
                      bottom: 10
                    }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis type="number" domain={[0, 10]} tick={{
                        fontSize: 10
                      }} />
                        <YAxis dataKey="category" type="category" tick={{
                        fontSize: 10
                      }} />
                        <RechartsTooltip contentStyle={{
                        fontSize: 12
                      }} />
                        <Bar dataKey="score" name="Risk Score (lower is better)" fill="#8884d8" />
                        <Legend wrapperStyle={{
                        fontSize: 10
                      }} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          <div>
            <h2 className="text-lg font-bold mb-3">Financial Highlights</h2>
            <div className="bg-gray-50 p-4 rounded-lg">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-4">
                <div>
                  <div className="text-sm text-gray-500 mb-1">Cash on Cash</div>
                  <div className="text-lg font-bold">{property.cashOnCash}%</div>
                </div>
                <div>
                  <div className="text-sm text-gray-500 mb-1">Cap Rate</div>
                  <div className="text-lg font-bold">{property.capRate}%</div>
                </div>
                <div>
                  <div className="text-sm text-gray-500 mb-1">NOI</div>
                  <div className="text-lg font-bold">${property.noi.toLocaleString()}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-500 mb-1">DSC Ratio</div>
                  <div className="text-lg font-bold">{property.debtServiceRatio}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-500 mb-1">LTV</div>
                  <div className="text-lg font-bold">{property.loanToValue}%</div>
                </div>
                <div>
                  <div className="text-sm text-gray-500 mb-1">Occupancy</div>
                  <div className="text-lg font-bold">{property.occupancyRate}%</div>
                </div>
              </div>
              
              <div className="flex items-center justify-between">
                <div className="text-xs text-gray-500">Projected Annual Returns</div>
                <div className="flex items-center">
                  <AreaChartIcon className="w-4 h-4 text-primary mr-1" />
                  <span className="text-xs font-bold text-primary">{property.roi}% Target</span>
                </div>
              </div>
            </div>
          </div>
          
          <div>
            <h2 className="text-lg font-bold mb-3">Location</h2>
            <PropertyMap location={property.location} lat={40.7128} lng={-74.0060} />
          </div>
        </div>
        
        <div className="space-y-6">
          <RecommendationRating 
            score={property.recommendationScore} 
            marketTrend={property.marketTrend} 
            entrepreneurExperience={property.entrepreneurExperience} 
            riskLevel={property.riskLevel} 
            demandLevel={property.demandLevel} 
            returnPotential={property.returnPotential} 
          />
          
          <div className="bg-white border rounded-lg p-4">
            <h3 className="font-semibold mb-3">Need Help?</h3>
            <p className="text-sm text-gray-600 mb-3">
              Our investment advisors are available to answer any questions about this property.
            </p>
            <Button 
              type="button" 
              variant="outline" 
              className="w-full"
              onClick={handleScheduleCall}
            >
              Schedule a Call
            </Button>
          </div>
          
          <div className="bg-white border rounded-lg p-4">
            <h3 className="font-semibold mb-3">Ready to Invest?</h3>
            <p className="text-sm text-gray-600 mb-3">
              Start your investment journey with as little as ${(2500).toLocaleString()}.
            </p>
            <LetterOfIntentForm 
              propertyId={property.id} 
              propertyName={property.name} 
              minInvestment={2500} 
            />
          </div>
        </div>
      </div>
    </div>;
};
