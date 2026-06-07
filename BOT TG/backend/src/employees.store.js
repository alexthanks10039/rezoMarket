export const employees = [
  {
    id: 'emp_sales',
    name: 'Менеджер продаж',
    role: 'Заказы и подтверждение наличия',
    status: 'На линии',
    phone: '+7 700 123 45 67',
  },
  {
    id: 'emp_selection',
    name: 'Специалист по подбору',
    role: 'Подбор по размеру, артикулу и модели техники',
    status: 'Принимает запросы',
    phone: '+7 701 234 56 78',
  },
  {
    id: 'emp_stock',
    name: 'Склад',
    role: 'Остатки, резервы и выдача заказов',
    status: 'Проверка наличия',
    phone: '+7 702 345 67 89',
  },
];

export const getEmployeeById = (employeeId) => employees.find((employee) => employee.id === employeeId) || null;
