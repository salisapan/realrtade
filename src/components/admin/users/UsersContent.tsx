
import { useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { PlusCircle, Settings, Trash2, Search } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

// Mock data for demonstration
const mockUsers = [
  { role: "admin", email: "realtrade324@gmail.com", full_name: "RealTrade", accredited: "Yes" },
  { role: "user", email: "jane.doe@example.com", full_name: "Jane Doe", accredited: "" },
  { role: "user", email: "john.smith@example.com", full_name: "John Smith", accredited: "Yes" },
  { role: "user", email: "alice.johnson@example.com", full_name: "Alice Johnson", accredited: "" },
];

export const UsersContent = () => {
  const [users, setUsers] = useState(mockUsers);
  const [searchQuery, setSearchQuery] = useState("");
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [schemaDialogOpen, setSchemaDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<string | null>(null);
  
  const [newUser, setNewUser] = useState({
    email: "",
    role: "user",
    full_name: "",
  });

  // Filter users based on search query
  const filteredUsers = users.filter(user => 
    user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.full_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleDeleteUser = (email: string) => {
    setUserToDelete(email);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (userToDelete) {
      setUsers(users.filter(user => user.email !== userToDelete));
      setDeleteDialogOpen(false);
      setUserToDelete(null);
    }
  };

  const handleInviteUser = () => {
    if (newUser.email && newUser.role) {
      setUsers([...users, { ...newUser, accredited: "" }]);
      setInviteDialogOpen(false);
      setNewUser({ email: "", role: "user", full_name: "" });
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Users</h1>
          <p className="text-gray-600">Manage users and their roles</p>
        </div>
        
        <div className="flex gap-3">
          <Button 
            className="bg-black text-white hover:bg-gray-800"
            onClick={() => setInviteDialogOpen(true)}
          >
            <PlusCircle className="w-4 h-4 mr-2" />
            Invite User
          </Button>
          
          <Button 
            variant="outline" 
            className="bg-gray-100"
            onClick={() => setSchemaDialogOpen(true)}
          >
            <Settings className="w-4 h-4 mr-2" />
            Schema
          </Button>
        </div>
      </div>
      
      <div className="mb-4 relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
        <Input
          placeholder="Search users by email or name"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>
      
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[15%]">role</TableHead>
              <TableHead className="w-[40%]">email</TableHead>
              <TableHead className="w-[30%]">full_name</TableHead>
              <TableHead className="w-[15%]">accredited</TableHead>
              <TableHead className="w-[5%]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredUsers.map((user) => (
              <TableRow key={user.email}>
                <TableCell>{user.role}</TableCell>
                <TableCell>{user.email}</TableCell>
                <TableCell>{user.full_name}</TableCell>
                <TableCell>{user.accredited}</TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDeleteUser(user.email)}
                    className="text-gray-500 hover:text-red-500"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {filteredUsers.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-gray-500">
                  No users found
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      
      {/* Invite User Dialog */}
      <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite a New User</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-700">Email</label>
              <Input
                value={newUser.email}
                onChange={(e) => setNewUser({...newUser, email: e.target.value})}
                placeholder="user@example.com"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Full Name</label>
              <Input
                value={newUser.full_name}
                onChange={(e) => setNewUser({...newUser, full_name: e.target.value})}
                placeholder="John Doe"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Role</label>
              <select
                value={newUser.role}
                onChange={(e) => setNewUser({...newUser, role: e.target.value})}
                className="w-full p-2 border border-gray-300 rounded-md"
              >
                <option value="user">User</option>
                <option value="admin">Admin</option>
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleInviteUser}>
              Invite
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Schema Dialog */}
      <Dialog open={schemaDialogOpen} onOpenChange={setSchemaDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>User Schema</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Define the user data schema. These fields will be available for all users.
            </p>
            <div className="border border-gray-200 p-3 rounded-md">
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium">role</span>
                <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">Required</span>
              </div>
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium">email</span>
                <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">Required</span>
              </div>
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium">full_name</span>
                <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">Required</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-medium">accredited</span>
                <span className="text-xs bg-gray-100 text-gray-800 px-2 py-1 rounded">Optional</span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setSchemaDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete User</DialogTitle>
          </DialogHeader>
          <p>
            Are you sure you want to delete this user? This action cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
