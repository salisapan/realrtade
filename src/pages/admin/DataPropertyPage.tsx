
import { useState } from "react";
import { WorkspaceLayout } from "@/components/admin/WorkspaceLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PlusCircle, Search, Edit, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

// Mock property data
const mockProperties = [
  { id: "1", name: "Modern Downtown Apartment", type: "Residential", location: "New York, NY", price: "$850,000", status: "Available" },
  { id: "2", name: "Luxury Beachfront Villa", type: "Residential", location: "Miami, FL", price: "$2,300,000", status: "Under Review" },
  { id: "3", name: "Office Space Tower", type: "Commercial", location: "Chicago, IL", price: "$5,500,000", status: "Available" },
  { id: "4", name: "Retail Shopping Center", type: "Commercial", location: "Los Angeles, CA", price: "$12,750,000", status: "Available" },
  { id: "5", name: "Multi-Family Housing Complex", type: "Residential", location: "Austin, TX", price: "$7,800,000", status: "Under Contract" }
];

const DataPropertyPage = () => {
  const [properties, setProperties] = useState(mockProperties);
  const [searchQuery, setSearchQuery] = useState("");
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedProperty, setSelectedProperty] = useState<any>(null);
  
  const [newProperty, setNewProperty] = useState({
    name: "",
    type: "Residential",
    location: "",
    price: "",
    status: "Available"
  });
  
  // Filter properties based on search query
  const filteredProperties = properties.filter(property => 
    property.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    property.location.toLowerCase().includes(searchQuery.toLowerCase()) ||
    property.type.toLowerCase().includes(searchQuery.toLowerCase())
  );
  
  const handleAddProperty = () => {
    if (newProperty.name && newProperty.location && newProperty.price) {
      const id = (properties.length + 1).toString();
      setProperties([...properties, { id, ...newProperty }]);
      setAddDialogOpen(false);
      setNewProperty({
        name: "",
        type: "Residential",
        location: "",
        price: "",
        status: "Available"
      });
    }
  };
  
  const handleEditProperty = () => {
    if (selectedProperty && selectedProperty.name && selectedProperty.location && selectedProperty.price) {
      setProperties(properties.map(property => 
        property.id === selectedProperty.id ? selectedProperty : property
      ));
      setEditDialogOpen(false);
      setSelectedProperty(null);
    }
  };
  
  const handleDeleteProperty = () => {
    if (selectedProperty) {
      setProperties(properties.filter(property => property.id !== selectedProperty.id));
      setDeleteDialogOpen(false);
      setSelectedProperty(null);
    }
  };
  
  const openEditDialog = (property: any) => {
    setSelectedProperty(property);
    setEditDialogOpen(true);
  };
  
  const openDeleteDialog = (property: any) => {
    setSelectedProperty(property);
    setDeleteDialogOpen(true);
  };
  
  return (
    <WorkspaceLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Property Data</h1>
        <p className="text-gray-600">Manage property listings and information</p>
      </div>
      
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Properties</CardTitle>
          <Button onClick={() => setAddDialogOpen(true)}>
            <PlusCircle className="h-4 w-4 mr-2" />
            Add Property
          </Button>
        </CardHeader>
        <CardContent>
          <div className="mb-4 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
            <Input
              placeholder="Search properties by name, location or type"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProperties.map((property) => (
                  <TableRow key={property.id}>
                    <TableCell className="font-medium">{property.name}</TableCell>
                    <TableCell>{property.type}</TableCell>
                    <TableCell>{property.location}</TableCell>
                    <TableCell>{property.price}</TableCell>
                    <TableCell>
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        property.status === "Available" 
                          ? "bg-green-100 text-green-800" 
                          : property.status === "Under Review"
                            ? "bg-yellow-100 text-yellow-800"
                            : "bg-blue-100 text-blue-800"
                      }`}>
                        {property.status}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEditDialog(property)}
                          className="text-gray-500 hover:text-blue-500"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openDeleteDialog(property)}
                          className="text-gray-500 hover:text-red-500"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {filteredProperties.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-gray-500">
                      No properties found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
      
      {/* Add Property Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Property</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-700">Name</label>
              <Input
                value={newProperty.name}
                onChange={(e) => setNewProperty({...newProperty, name: e.target.value})}
                placeholder="Property Name"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Type</label>
              <select
                value={newProperty.type}
                onChange={(e) => setNewProperty({...newProperty, type: e.target.value})}
                className="w-full p-2 border border-gray-300 rounded-md"
              >
                <option value="Residential">Residential</option>
                <option value="Commercial">Commercial</option>
                <option value="Industrial">Industrial</option>
                <option value="Land">Land</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Location</label>
              <Input
                value={newProperty.location}
                onChange={(e) => setNewProperty({...newProperty, location: e.target.value})}
                placeholder="City, State"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Price</label>
              <Input
                value={newProperty.price}
                onChange={(e) => setNewProperty({...newProperty, price: e.target.value})}
                placeholder="$1,000,000"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Status</label>
              <select
                value={newProperty.status}
                onChange={(e) => setNewProperty({...newProperty, status: e.target.value})}
                className="w-full p-2 border border-gray-300 rounded-md"
              >
                <option value="Available">Available</option>
                <option value="Under Review">Under Review</option>
                <option value="Under Contract">Under Contract</option>
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddProperty}>
              Add Property
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Edit Property Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Property</DialogTitle>
          </DialogHeader>
          {selectedProperty && (
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700">Name</label>
                <Input
                  value={selectedProperty.name}
                  onChange={(e) => setSelectedProperty({...selectedProperty, name: e.target.value})}
                  placeholder="Property Name"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Type</label>
                <select
                  value={selectedProperty.type}
                  onChange={(e) => setSelectedProperty({...selectedProperty, type: e.target.value})}
                  className="w-full p-2 border border-gray-300 rounded-md"
                >
                  <option value="Residential">Residential</option>
                  <option value="Commercial">Commercial</option>
                  <option value="Industrial">Industrial</option>
                  <option value="Land">Land</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Location</label>
                <Input
                  value={selectedProperty.location}
                  onChange={(e) => setSelectedProperty({...selectedProperty, location: e.target.value})}
                  placeholder="City, State"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Price</label>
                <Input
                  value={selectedProperty.price}
                  onChange={(e) => setSelectedProperty({...selectedProperty, price: e.target.value})}
                  placeholder="$1,000,000"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Status</label>
                <select
                  value={selectedProperty.status}
                  onChange={(e) => setSelectedProperty({...selectedProperty, status: e.target.value})}
                  className="w-full p-2 border border-gray-300 rounded-md"
                >
                  <option value="Available">Available</option>
                  <option value="Under Review">Under Review</option>
                  <option value="Under Contract">Under Contract</option>
                </select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleEditProperty}>
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Property</DialogTitle>
          </DialogHeader>
          <p>
            Are you sure you want to delete "{selectedProperty?.name}"? This action cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteProperty}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </WorkspaceLayout>
  );
};

export default DataPropertyPage;
