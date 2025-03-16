
import { useState, useEffect } from "react";
import { WorkspaceLayout } from "@/components/admin/WorkspaceLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PlusCircle, Search, Edit, Trash2, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { getAllProperties, addProperty, updateProperty, deleteProperty } from "@/services/propertyService";

const DataPropertyPage = () => {
  const { toast } = useToast();
  const [properties, setProperties] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedProperty, setSelectedProperty] = useState<any>(null);
  
  const [newProperty, setNewProperty] = useState({
    title: "",
    location: "",
    company: "",
    website: "",
    cashOnCash: "",
    upside: "",
    funded: "",
    rented: "",
    sqft: "",
    floors: "",
    status: "Available",
    year: "",
    price: "",
    imageUrl: "",
    category: "sector",
    minInvestment: 2500
  });
  
  // Fetch properties from Supabase
  useEffect(() => {
    const fetchProperties = async () => {
      try {
        setIsLoading(true);
        const data = await getAllProperties();
        setProperties(data);
      } catch (error) {
        console.error("Error fetching properties:", error);
        toast({
          title: "Error",
          description: "Failed to load properties. Please try again.",
          variant: "destructive"
        });
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchProperties();
  }, [toast]);
  
  // Filter properties based on search query
  const filteredProperties = properties.filter(property => 
    property.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    property.location.toLowerCase().includes(searchQuery.toLowerCase()) ||
    property.company.toLowerCase().includes(searchQuery.toLowerCase())
  );
  
  const handleAddProperty = async () => {
    if (newProperty.title && newProperty.location && newProperty.price) {
      try {
        const result = await addProperty(newProperty);
        
        if (result) {
          setProperties([...properties, result]);
          setAddDialogOpen(false);
          setNewProperty({
            title: "",
            location: "",
            company: "",
            website: "",
            cashOnCash: "",
            upside: "",
            funded: "",
            rented: "",
            sqft: "",
            floors: "",
            status: "Available",
            year: "",
            price: "",
            imageUrl: "",
            category: "sector",
            minInvestment: 2500
          });
          
          toast({
            title: "Property Added",
            description: "The property has been added successfully.",
          });
        } else {
          throw new Error("Failed to add property");
        }
      } catch (error) {
        console.error("Error adding property:", error);
        toast({
          title: "Error",
          description: "Failed to add property. Please try again.",
          variant: "destructive"
        });
      }
    }
  };
  
  const handleEditProperty = async () => {
    if (selectedProperty && selectedProperty.title && selectedProperty.location && selectedProperty.price) {
      try {
        const result = await updateProperty(selectedProperty.id, selectedProperty);
        
        if (result) {
          setProperties(properties.map(property => 
            property.id === selectedProperty.id ? selectedProperty : property
          ));
          setEditDialogOpen(false);
          setSelectedProperty(null);
          
          toast({
            title: "Property Updated",
            description: "The property has been updated successfully.",
          });
        } else {
          throw new Error("Failed to update property");
        }
      } catch (error) {
        console.error("Error updating property:", error);
        toast({
          title: "Error",
          description: "Failed to update property. Please try again.",
          variant: "destructive"
        });
      }
    }
  };
  
  const handleDeleteProperty = async () => {
    if (selectedProperty) {
      try {
        const success = await deleteProperty(selectedProperty.id);
        
        if (success) {
          setProperties(properties.filter(property => property.id !== selectedProperty.id));
          setDeleteDialogOpen(false);
          setSelectedProperty(null);
          
          toast({
            title: "Property Deleted",
            description: "The property has been deleted successfully.",
          });
        } else {
          throw new Error("Failed to delete property");
        }
      } catch (error) {
        console.error("Error deleting property:", error);
        toast({
          title: "Error",
          description: "Failed to delete property. Please try again.",
          variant: "destructive"
        });
      }
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
              placeholder="Search properties by name, location or company"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          
          <div className="border rounded-lg overflow-hidden">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 text-primary animate-spin mr-2" />
                <span>Loading properties...</span>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Company</TableHead>
                    <TableHead>Price</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[100px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredProperties.map((property) => (
                    <TableRow key={property.id}>
                      <TableCell className="font-medium">{property.title}</TableCell>
                      <TableCell>{property.location}</TableCell>
                      <TableCell>{property.company}</TableCell>
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
            )}
          </div>
        </CardContent>
      </Card>
      
      {/* Add Property Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Property</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 max-h-[60vh] overflow-y-auto">
            <div>
              <label className="text-sm font-medium text-gray-700">Title</label>
              <Input
                value={newProperty.title}
                onChange={(e) => setNewProperty({...newProperty, title: e.target.value})}
                placeholder="Property Title"
              />
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
              <label className="text-sm font-medium text-gray-700">Company</label>
              <Input
                value={newProperty.company}
                onChange={(e) => setNewProperty({...newProperty, company: e.target.value})}
                placeholder="Developer Company"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Website</label>
              <Input
                value={newProperty.website}
                onChange={(e) => setNewProperty({...newProperty, website: e.target.value})}
                placeholder="https://example.com"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Category</label>
              <select
                value={newProperty.category}
                onChange={(e) => setNewProperty({...newProperty, category: e.target.value})}
                className="w-full p-2 border border-gray-300 rounded-md"
              >
                <option value="sector">Sector</option>
                <option value="low-risk">Low Risk</option>
                <option value="geography">Geography</option>
                <option value="profitable">Profitable</option>
                <option value="company">Company</option>
              </select>
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
            <div>
              <label className="text-sm font-medium text-gray-700">Minimum Investment</label>
              <Input
                type="number"
                value={newProperty.minInvestment}
                onChange={(e) => setNewProperty({...newProperty, minInvestment: parseInt(e.target.value) || 2500})}
                placeholder="2500"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Image URL</label>
              <Input
                value={newProperty.imageUrl}
                onChange={(e) => setNewProperty({...newProperty, imageUrl: e.target.value})}
                placeholder="https://example.com/image.jpg"
              />
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
            <div className="space-y-4 max-h-[60vh] overflow-y-auto">
              <div>
                <label className="text-sm font-medium text-gray-700">Title</label>
                <Input
                  value={selectedProperty.title}
                  onChange={(e) => setSelectedProperty({...selectedProperty, title: e.target.value})}
                  placeholder="Property Title"
                />
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
                <label className="text-sm font-medium text-gray-700">Company</label>
                <Input
                  value={selectedProperty.company}
                  onChange={(e) => setSelectedProperty({...selectedProperty, company: e.target.value})}
                  placeholder="Developer Company"
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
              <div>
                <label className="text-sm font-medium text-gray-700">Minimum Investment</label>
                <Input
                  type="number"
                  value={selectedProperty.minInvestment}
                  onChange={(e) => setSelectedProperty({...selectedProperty, minInvestment: parseInt(e.target.value) || 2500})}
                  placeholder="2500"
                />
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
            Are you sure you want to delete "{selectedProperty?.title}"? This action cannot be undone.
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
