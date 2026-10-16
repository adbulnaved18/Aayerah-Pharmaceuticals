import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Header } from "@/components/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/contexts/AuthContext";
import { Product } from "@/contexts/CartContext";
import {
  DollarSign,
  Package,
  ShoppingBag,
  Users,
  Edit,
  Trash2,
  Plus,
  Eye,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { API_ENDPOINTS, apiClient, authHeaders } from "@/lib/api";

const AdminDashboard = () => {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [orderDetailOpen, setOrderDetailOpen] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [productFormOpen, setProductFormOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    price: "",
    description: "",
    image: "",
    category: "",
    stock: "",
    discount: "",
    bgColor: "",
    panelColor: "",
    textColor: ""
  });
  const [imageFile, setImageFile] = useState<File | null>(null);

  useEffect(() => {
    if (!isAdmin) {
      navigate("/admin/login");
    }
  }, [isAdmin, navigate]);

  // Fetch products from backend
  useEffect(() => {
    const fetchProducts = async () => {
      try {
        // For admin dashboard, we still need to fetch products (public endpoint)
        const response = await apiClient.getAll(API_ENDPOINTS.PRODUCTS_SHOP, false);
        if (response.ok) {
          const data = await response.json();
          // Map backend data to frontend Product type
          const mappedProducts: Product[] = data.map((product: any) => ({
            id: product._id,
            name: product.name,
            price: product.price,
            description: product.description,
            image: product.image?.url || product.image || "",
            category: product.category || "General",
            stock: product.stock, discount: product.discount, bgColor: product.bgColor, panelColor: product.panelColor, textColor: product.textColor
          }));
          setProducts(mappedProducts);
        } else {
          toast({
            title: "Error",
            description: "Failed to fetch products",
            variant: "destructive"
          });
        }
      } catch (error) {
        toast({
          title: "Error",
          description: "Failed to connect to server",
          variant: "destructive"
        });
      }
    };

    fetchProducts();
  }, []);

  const [orders, setOrders] = useState<any[]>([]);
  const [summary, setSummary] = useState({ totalRevenue: 0, totalOrders: 0, customers: 0, products: 0 });
  useEffect(() => {
    if (!isAdmin) return;
    Promise.all([
      apiClient.getAll(API_ENDPOINTS.OWNER_ORDERS, true).then(r => r.json()),
      apiClient.get(API_ENDPOINTS.OWNER_STATS, true).then(r => r.json()),
    ]).then(([data, totals]) => { setOrders(data); setSummary(totals); })
      .catch(error => toast({ title: 'Unable to load orders', description: error.message, variant: 'destructive' }));
  }, [isAdmin]);
  const totalRevenue = summary.totalRevenue;
  const totalOrders = summary.totalOrders;
  const uniqueCustomers = summary.customers;

  const stats = [
    {
      title: "Total Revenue",
      value: `₹₹{totalRevenue.toFixed(2)}`,
      icon: DollarSign,
      color: "text-green-600",
    },
    {
      title: "Total Orders",
      value: totalOrders,
      icon: ShoppingBag,
      color: "text-blue-600",
    },
    {
      title: "Products",
      value: products.length,
      icon: Package,
      color: "text-purple-600",
    },
    {
      title: "Customers",
      value: uniqueCustomers,
      icon: Users,
      color: "text-orange-600",
    },
  ];

  const [updatingOrder, setUpdatingOrder] = useState(false);
  const advanceOrder = async (status: string) => {
    if (!selectedOrder || updatingOrder) return;
    setUpdatingOrder(true);
    try {
      const updated = await (await apiClient.patch(API_ENDPOINTS.ORDER_STATUS(selectedOrder.id), { status }, true)).json();
      setSelectedOrder(updated);
      setOrders(previous => previous.map(order => order.id === updated.id ? updated : order));
      const totals = await (await apiClient.get(API_ENDPOINTS.OWNER_STATS, true)).json();
      setSummary(totals);
    } catch (error) { toast({ title: 'Unable to update order', description: error instanceof Error ? error.message : 'Request failed', variant: 'destructive' }); }
    finally { setUpdatingOrder(false); }
  };

  const handleViewOrder = (order: any) => {
    setSelectedOrder(order);
    setOrderDetailOpen(true);
  };

  const handleCreateProduct = () => {
    setEditingProduct(null);
    setFormData({
      name: "",
      price: "",
      description: "",
      image: "",
      category: "",
      stock: "",
      discount: "",
      bgColor: "",
      panelColor: "",
      textColor: ""
    });
    setImageFile(null);
    setProductFormOpen(true);
  };

  const handleEditProduct = (product: Product) => {
    setEditingProduct(product);
    setFormData({
      name: product.name,
      price: product.price.toString(),
      description: product.description,
      image: product.image,
      category: product.category,
      stock: product.stock.toString(),
      discount: String(product.discount ?? 0),
      bgColor: product.bgColor || "#ffffff",
      panelColor: product.panelColor || "#ffffff",
      textColor: product.textColor || "#000000"
    });
    setImageFile(null);
    setProductFormOpen(true);
  };

  const handleDeleteProduct = async (productId: string) => {
    try {
      setLoading(true);
      // For product deletion, we need to include credentials as it's an admin operation
      const response = await apiClient.post(API_ENDPOINTS.PRODUCT_DELETE(productId), undefined, true);
      
      if (response.ok) {
        const updatedProducts = products.filter((p) => p.id !== productId);
        setProducts(updatedProducts);
        toast({
          title: "Product deleted",
          description: "Product has been removed successfully.",
        });
      } else {
        toast({
          title: "Error",
          description: "Failed to delete product",
          variant: "destructive"
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to connect to server",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSaveProduct = async () => {
    if (
      !formData.name ||
      !formData.price ||
      !formData.description ||
      !formData.category ||
      !formData.stock
    ) {
      toast({
        title: "Error",
        description: "Please fill in all required fields.",
        variant: "destructive",
      });
      return;
    }

    if (!editingProduct && !imageFile) {
      toast({
        title: "Error",
        description: "Please select an image for the product.",
        variant: "destructive",
      });
      return;
    }

    try {
      setLoading(true);
      
      // Create FormData for multipart/form-data submission
      const productData = new FormData();
      productData.append("name", formData.name);
      productData.append("price", formData.price);
      productData.append("description", formData.description);
      productData.append("category", formData.category);
      productData.append("stock", formData.stock);
      
      // Append optional fields if they have values
      if (formData.discount) productData.append("discount", formData.discount);
      if (formData.bgColor) productData.append("bgColor", formData.bgColor);
      if (formData.panelColor) productData.append("panelColor", formData.panelColor);
      if (formData.textColor) productData.append("textColor", formData.textColor);
      
      // Append image file if selected
      if (imageFile) {
        productData.append("image", imageFile);
      }

      const url = editingProduct 
        ? API_ENDPOINTS.PRODUCT_UPDATE(editingProduct.id)
        : API_ENDPOINTS.PRODUCT_CREATE;

      // For product creation/update, we need to include credentials as it's an admin operation
      const response = await fetch(url, {
        method: editingProduct ? "POST" : "POST",
        body: productData,
        headers: authHeaders()
      });

      if (response.ok) {
        const result = await response.json();
        
        // Refresh products list
        const responseProducts = await apiClient.getAll(API_ENDPOINTS.PRODUCTS_SHOP, false);
        if (responseProducts.ok) {
          const data = await responseProducts.json();
          const mappedProducts: Product[] = data.map((product: any) => ({
            id: product._id,
            name: product.name,
            price: product.price,
            description: product.description,
            image: product.image?.url || product.image || "",
            category: product.category || "General",
            stock: product.stock, discount: product.discount, bgColor: product.bgColor, panelColor: product.panelColor, textColor: product.textColor
          }));
          setProducts(mappedProducts);
        }
        
        toast({
          title: editingProduct ? "Product updated" : "Product created",
          description: editingProduct 
            ? "Product has been updated successfully." 
            : "New product has been created successfully."
        });
        
        setProductFormOpen(false);
      } else {
        const error = await response.json();
        toast({
          title: "Error",
          description: error.message || "Failed to save product",
          variant: "destructive"
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to connect to server",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen">
      <Header />

      <div className="container py-8">
        <h1 className="text-4xl font-bold mb-8">Admin Dashboard</h1>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {stats.map((stat) => (
            <Card key={stat.title}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  {stat.title}
                </CardTitle>
                <stat.icon className={`h-5 w-5 ₹{stat.color}`} />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stat.value}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid gap-8">
          <Card>
            <CardHeader>
              <CardTitle>Recent Orders</CardTitle>
            </CardHeader>
            <CardContent>
              {orders.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">
                  No orders yet
                </p>
              ) : (
                <div className="space-y-4">
                  {orders
                    .slice(-5)
                    .reverse()
                    .map((order: any) => (
                      <div
                        key={order.id}
                        className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent cursor-pointer transition-colors"
                        onClick={() => handleViewOrder(order)}
                      >
                        <div>
                          <p className="font-semibold">Order #{order.id}</p>
                          <p className="text-sm text-muted-foreground">
                            {new Date(order.date).toLocaleDateString()}
                          </p>
                        </div>
                        <div className="text-right flex items-center gap-4">
                          <div>
                            <p className="font-bold text-primary">
                              ₹{order.total.toFixed(2)}
                            </p>
                            <p className="text-sm text-muted-foreground capitalize">
                              {order.status}
                            </p>
                          </div>
                          <Eye className="h-4 w-4 text-muted-foreground" />
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Product Management</CardTitle>
              <Button onClick={handleCreateProduct}>
                <Plus className="h-4 w-4 mr-2" />
                Add Product
              </Button>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Image</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Price</TableHead>
                    <TableHead>Stock</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {products.map((product) => (
                    <TableRow key={product.id}>
                      <TableCell>
                        <img
                          src={product.image}
                          alt={product.name}
                          className="w-12 h-12 object-cover rounded"
                        />
                      </TableCell>
                      <TableCell className="font-medium">
                        {product.name}
                      </TableCell>
                      <TableCell>{product.category}</TableCell>
                      <TableCell>₹{product.price.toFixed(2)}</TableCell>
                      <TableCell>{product.stock}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() => handleEditProduct(product)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="destructive"
                            size="icon"
                            onClick={() => handleDeleteProduct(product.id)}
                            disabled={loading}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Order Detail Dialog */}
      <Dialog open={orderDetailOpen} onOpenChange={setOrderDetailOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Order Details</DialogTitle>
            <DialogDescription>Order #{selectedOrder?.id}</DialogDescription>
          </DialogHeader>
          {selectedOrder && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">Order Date</Label>
                  <p className="font-medium">
                    {new Date(selectedOrder.date).toLocaleString()}
                  </p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Status</Label>
                  <p className="font-medium capitalize">
                    {selectedOrder.status} · {selectedOrder.paymentStatus}
                  </p>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {({ pending: ['confirmed', 'cancelled'], confirmed: ['shipped', 'cancelled'], shipped: ['delivered'] }[selectedOrder.status] || []).map((status: string) =>
                      <Button key={status} size="sm" disabled={updatingOrder} onClick={() => advanceOrder(status)}>{status === 'delivered' ? 'Delivered & COD collected' : status}</Button>)}
                  </div>
                </div>
                <div>
                  <Label className="text-muted-foreground">
                    Customer Email
                  </Label>
                  <p className="font-medium">{selectedOrder.customerEmail}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Total Amount</Label>
                  <p className="font-bold text-primary text-lg">
                    ₹{selectedOrder.total.toFixed(2)}
                  </p>
                </div>
              </div>

              <div>
                <Label className="text-muted-foreground">
                  Shipping Address
                </Label>
                <div className="mt-2 p-4 bg-accent rounded-lg">
                  <p className="font-medium">
                    {selectedOrder.shippingAddress?.fullName}
                  </p>
                  <p className="text-sm mt-1">
                    {selectedOrder.shippingAddress?.address}
                  </p>
                  <p className="text-sm">
                    {selectedOrder.shippingAddress?.city},{" "}
                    {selectedOrder.shippingAddress?.state}{" "}
                    {selectedOrder.shippingAddress?.zipCode}
                  </p>
                  <p className="text-sm">
                    {selectedOrder.shippingAddress?.country}
                  </p>
                  <p className="text-sm mt-2">
                    Phone: {selectedOrder.shippingAddress?.phone}
                  </p>
                </div>
              </div>

              <div>
                <Label className="text-muted-foreground">Order Items</Label>
                <div className="mt-2 space-y-2">
                  {selectedOrder.items?.map((item: any, index: number) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-3 bg-accent rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <img
                          src={item.image}
                          alt={item.name}
                          className="w-12 h-12 object-cover rounded"
                        />
                        <div>
                          <p className="font-medium">{item.name}</p>
                          <p className="text-sm text-muted-foreground">
                            Quantity: {item.quantity}
                          </p>
                        </div>
                      </div>
                      <p className="font-medium">
                        ₹{(item.price * item.quantity).toFixed(2)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Product Form Dialog */}
      <Dialog open={productFormOpen} onOpenChange={setProductFormOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingProduct ? "Edit Product" : "Create New Product"}
            </DialogTitle>
            <DialogDescription>
              {editingProduct
                ? "Update product information"
                : "Add a new product to your store"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="name">Product Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                placeholder="Enter product name"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="price">Price (₹) *</Label>
                <Input
                  id="price"
                  type="number"
                  step="0.01"
                  value={formData.price}
                  onChange={(e) =>
                    setFormData({ ...formData, price: e.target.value })
                  }
                  placeholder="0.00"
                />
              </div>
              <div>
                <Label htmlFor="stock">Stock Quantity *</Label>
                <Input
                  id="stock"
                  type="number"
                  value={formData.stock}
                  onChange={(e) =>
                    setFormData({ ...formData, stock: e.target.value })
                  }
                  placeholder="0"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="category">Category *</Label>
              <Input
                id="category"
                value={formData.category}
                onChange={(e) =>
                  setFormData({ ...formData, category: e.target.value })
                }
                placeholder="Enter product category"
              />
            </div>
            <div>
              <Label htmlFor="description">Description *</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                placeholder="Enter product description"
                rows={4}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="discount">Discount (%)</Label>
                <Input
                  id="discount"
                  type="number"
                  value={formData.discount}
                  onChange={(e) =>
                    setFormData({ ...formData, discount: e.target.value })
                  }
                  placeholder="0"
                />
              </div>
              <div>
                <Label htmlFor="image">Image *</Label>
                <Input
                  id="image"
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      setImageFile(file);
                    }
                  }}
                />
                {editingProduct && !imageFile && (
                  <p className="text-sm text-muted-foreground mt-1">
                    Leave blank to keep current image
                  </p>
                )}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label htmlFor="bgColor">Background Color</Label>
                <Input
                  id="bgColor"
                  value={formData.bgColor}
                  onChange={(e) =>
                    setFormData({ ...formData, bgColor: e.target.value })
                  }
                  placeholder="#FFFFFF"
                />
              </div>
              <div>
                <Label htmlFor="panelColor">Panel Color</Label>
                <Input
                  id="panelColor"
                  value={formData.panelColor}
                  onChange={(e) =>
                    setFormData({ ...formData, panelColor: e.target.value })
                  }
                  placeholder="#FFFFFF"
                />
              </div>
              <div>
                <Label htmlFor="textColor">Text Color</Label>
                <Input
                  id="textColor"
                  value={formData.textColor}
                  onChange={(e) =>
                    setFormData({ ...formData, textColor: e.target.value })
                  }
                  placeholder="#000000"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button
                variant="outline"
                onClick={() => setProductFormOpen(false)}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button onClick={handleSaveProduct} disabled={loading}>
                {loading ? "Saving..." : editingProduct ? "Update Product" : "Create Product"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminDashboard;