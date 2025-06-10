import tkinter as tk
from tkinter import ttk, messagebox
from tkinter.scrolledtext import ScrolledText
import ttkbootstrap as bttk
from ttkbootstrap.widgets import Notebook, DateEntry
import mysql.connector
import requests
import threading
import queue
from datetime import datetime

class DrugImporterApp(bttk.Frame):
    def __init__(self, master):
        super().__init__(master, padding=15)
        self.pack(fill=tk.BOTH, expand=True)
        self.master = master
        self.log_queue = queue.Queue()
        self.full_user_list = [] # สำหรับเก็บข้อมูลผู้ใช้ทั้งหมดจาก API
        self.filtered_user_list = [] # สำหรับเก็บผู้ใช้ที่กรองตาม HCODE แล้ว
        self.create_widgets()
        self.process_log_queue()

    def create_widgets(self):
        # สร้าง UI หลัก
        notebook = Notebook(self)
        notebook.pack(fill=tk.BOTH, expand=True, pady=5)
        tab1 = bttk.Frame(notebook, padding=15)
        tab2 = bttk.Frame(notebook, padding=15)
        notebook.add(tab1, text="  นำเข้ารายการยา (Drug List Importer)  ")
        notebook.add(tab2, text="  นำเข้าข้อมูลจ่ายยา (Dispense Importer)  ")
        self.create_drug_list_importer_tab(tab1)
        self.create_dispense_importer_tab(tab2)
        log_frame = bttk.Labelframe(self, text="ประวัติการทำงาน", padding=15)
        log_frame.pack(fill=tk.X, pady=(10, 0), side=tk.BOTTOM)
        self.log_area = ScrolledText(log_frame, height=10, state=tk.DISABLED, font=("Consolas", 10))
        self.log_area.pack(fill=tk.BOTH, expand=True)

    def create_drug_list_importer_tab(self, parent_frame):
        # UI ของ Tab 1
        self.drug_list_data = []
        self.central_drug_codes = set()
        config_frame = bttk.Labelframe(parent_frame, text="ตั้งค่า", padding=15)
        config_frame.pack(fill=tk.X, pady=(0, 10))
        config_frame.columnconfigure(1, weight=1)
        config_frame.columnconfigure(3, weight=1)
        
        bttk.Label(config_frame, text="Web API URL:").grid(row=0, column=0, sticky=tk.W, padx=5, pady=2)
        self.api_url_var = tk.StringVar(value="http://sanchai.totddns.com:63520")
        bttk.Entry(config_frame, textvariable=self.api_url_var).grid(row=0, column=1, columnspan=3, sticky=tk.EW, padx=5, pady=2)
        
        bttk.Label(config_frame, text="HCODE:").grid(row=1, column=0, sticky=tk.W, padx=5, pady=2)
        self.hcode_var = tk.StringVar(value="")
        hcode_entry = bttk.Entry(config_frame, textvariable=self.hcode_var)
        hcode_entry.grid(row=1, column=1, sticky=tk.EW, padx=5, pady=2)

        self.load_users_button = bttk.Button(config_frame, text="โหลดผู้ใช้งาน", command=self.start_load_users_thread, bootstyle="outline")
        self.load_users_button.grid(row=1, column=2, padx=(10,5), pady=2)
        
        bttk.Label(config_frame, text="MySQL Host:").grid(row=2, column=0, sticky=tk.W, padx=5, pady=2)
        self.db_host_var = tk.StringVar(value="127.0.0.1")
        bttk.Entry(config_frame, textvariable=self.db_host_var).grid(row=2, column=1, sticky=tk.EW, padx=5, pady=2)
        
        bttk.Label(config_frame, text="Database:").grid(row=2, column=2, sticky=tk.W, padx=(10, 5), pady=2)
        self.db_name_var = tk.StringVar(value="hosxp_pcu")
        bttk.Entry(config_frame, textvariable=self.db_name_var).grid(row=2, column=3, sticky=tk.EW, padx=5, pady=2)
        
        bttk.Label(config_frame, text="User:").grid(row=3, column=0, sticky=tk.W, padx=5, pady=2)
        self.db_user_var = tk.StringVar(value="sa")
        bttk.Entry(config_frame, textvariable=self.db_user_var).grid(row=3, column=1, sticky=tk.EW, padx=5, pady=2)
        
        bttk.Label(config_frame, text="Password:").grid(row=3, column=2, sticky=tk.W, padx=(10, 5), pady=2)
        self.db_pass_var = tk.StringVar(value="sa")
        bttk.Entry(config_frame, textvariable=self.db_pass_var, show="*").grid(row=3, column=3, sticky=tk.EW, padx=5, pady=2)
        
        action_frame = bttk.Frame(parent_frame)
        action_frame.pack(fill=tk.X, pady=5)
        self.fetch_drug_list_button = bttk.Button(action_frame, text="1. ดึงรายการยา", command=self.start_fetch_drug_list_thread, bootstyle="primary")
        self.fetch_drug_list_button.pack(side=tk.LEFT, padx=(0, 5))
        self.compare_button = bttk.Button(action_frame, text="2. เปรียบเทียบข้อมูล", command=self.start_compare_thread, bootstyle="info", state=tk.DISABLED)
        self.compare_button.pack(side=tk.LEFT, padx=5)
        self.send_drug_list_button = bttk.Button(action_frame, text="3. ส่งรายการยาใหม่", command=self.start_send_drug_list_thread, bootstyle="success", state=tk.DISABLED)
        self.send_drug_list_button.pack(side=tk.LEFT, padx=5)
        self.drug_list_progress = bttk.Progressbar(parent_frame, mode='determinate', bootstyle="info-striped")
        self.drug_list_progress.pack(fill=tk.X, pady=10)
        tree_frame = bttk.Labelframe(parent_frame, text="รายการยา", padding=15)
        tree_frame.pack(fill=tk.BOTH, expand=True, pady=5)
        tree_frame.rowconfigure(0, weight=1); tree_frame.columnconfigure(0, weight=1)
        columns = ("status", "icode", "name", "strength", "units")
        self.drug_list_tree = bttk.Treeview(tree_frame, columns=columns, show="headings", height=10)
        self.drug_list_tree.heading("status", text="สถานะ"); self.drug_list_tree.column("status", width=120, anchor=tk.W)
        self.drug_list_tree.heading("icode", text="รหัสยา (icode)"); self.drug_list_tree.column("icode", width=120, anchor=tk.W)
        self.drug_list_tree.heading("name", text="ชื่อยา"); self.drug_list_tree.column("name", width=300, anchor=tk.W)
        self.drug_list_tree.heading("strength", text="ความแรง"); self.drug_list_tree.column("strength", width=150, anchor=tk.W)
        self.drug_list_tree.heading("units", text="หน่วยนับ"); self.drug_list_tree.column("units", width=100, anchor=tk.W)
        self.drug_list_tree.tag_configure('new', background='#d4edda'); self.drug_list_tree.tag_configure('duplicate', background='#fff3cd'); self.drug_list_tree.tag_configure('sent', background='#d1ecf1')
        tree_scrollbar = bttk.Scrollbar(tree_frame, orient=tk.VERTICAL, command=self.drug_list_tree.yview)
        self.drug_list_tree.configure(yscrollcommand=tree_scrollbar.set)
        tree_scrollbar.grid(row=0, column=1, sticky='ns'); self.drug_list_tree.grid(row=0, column=0, sticky='nsew')
    
    def create_dispense_importer_tab(self, parent_frame):
        # UI ของ Tab 2
        self.dispense_data = []
        self.medicine_code_map = {}
        dispense_config_frame = bttk.Labelframe(parent_frame, text="ขั้นตอนที่ 1: ดึงข้อมูลการจ่ายยาจาก HOSxP", padding=15)
        dispense_config_frame.pack(fill=tk.X, pady=(0, 10))
        dispense_config_frame.columnconfigure(1, weight=1)
        bttk.Label(dispense_config_frame, text="วันที่จ่ายยา (เริ่มต้น):").grid(row=0, column=0, sticky=tk.W, padx=5, pady=5)
        
        # === จุดที่แก้ไข: กำหนด dateformat และ firstweekday ===
        self.start_date_entry = DateEntry(dispense_config_frame, bootstyle="primary", dateformat="%d/%m/%Y", firstweekday=0)
        self.start_date_entry.grid(row=0, column=1, sticky=tk.EW, padx=5, pady=5)
        bttk.Label(dispense_config_frame, text="วันที่จ่ายยา (สิ้นสุด):").grid(row=1, column=0, sticky=tk.W, padx=5, pady=5)
        self.end_date_entry = DateEntry(dispense_config_frame, bootstyle="primary", dateformat="%d/%m/%Y", firstweekday=0)
        # =======================================================
        self.end_date_entry.grid(row=1, column=1, sticky=tk.EW, padx=5, pady=5)
        self.fetch_dispense_button = bttk.Button(dispense_config_frame, text="ดึงข้อมูลและตรวจสอบ", command=self.start_fetch_dispense_thread)
        self.fetch_dispense_button.grid(row=0, column=2, rowspan=2, padx=20, ipady=10)
        
        send_frame = bttk.Labelframe(parent_frame, text="ขั้นตอนที่ 2: ยืนยันและส่งข้อมูลเพื่อตัดจ่าย", padding=15)
        send_frame.pack(fill=tk.X, pady=10)
        send_frame.columnconfigure(1, weight=1)

        bttk.Label(send_frame, text="เลือกผู้จ่ายยา:").grid(row=0, column=0, sticky=tk.W, padx=5, pady=2)
        self.dispenser_combobox = ttk.Combobox(send_frame, state="readonly", width=40)
        self.dispenser_combobox.grid(row=0, column=1, sticky=tk.EW, padx=5, pady=2)
        
        self.send_dispense_button = bttk.Button(send_frame, text="ยืนยันและส่งข้อมูลตัดจ่ายยา", command=self.start_send_dispense_thread, bootstyle="danger", state=tk.DISABLED)
        self.send_dispense_button.grid(row=0, column=2, padx=20, ipady=10)

        dispense_tree_frame = bttk.Labelframe(parent_frame, text="รายการจ่ายยาที่ดึงมา (Preview)", padding=15)
        dispense_tree_frame.pack(fill=tk.BOTH, expand=True, pady=5)
        dispense_tree_frame.rowconfigure(0, weight=1); dispense_tree_frame.columnconfigure(0, weight=1)
        dispense_cols = ("status", "vstdate", "icode", "hos_guid", "qty")
        self.dispense_tree = bttk.Treeview(dispense_tree_frame, columns=dispense_cols, show="headings", height=10)
        self.dispense_tree.heading("status", text="สถานะ"); self.dispense_tree.column("status", width=150, anchor=tk.W)
        self.dispense_tree.heading("vstdate", text="วันที่จ่าย"); self.dispense_tree.column("vstdate", width=150, anchor=tk.W)
        self.dispense_tree.heading("icode", text="รหัสยา (icode)"); self.dispense_tree.column("icode", width=150, anchor=tk.W)
        self.dispense_tree.heading("hos_guid", text="HOS GUID"); self.dispense_tree.column("hos_guid", width=250, anchor=tk.W)
        self.dispense_tree.heading("qty", text="จำนวน"); self.dispense_tree.column("qty", width=100, anchor=tk.E)
        self.dispense_tree.tag_configure('ready', background='#d4edda'); self.dispense_tree.tag_configure('error', background='#f8d7da')
        dispense_scrollbar = bttk.Scrollbar(dispense_tree_frame, orient=tk.VERTICAL, command=self.dispense_tree.yview)
        self.dispense_tree.configure(yscrollcommand=dispense_scrollbar.set)
        dispense_scrollbar.grid(row=0, column=1, sticky='ns'); self.dispense_tree.grid(row=0, column=0, sticky='nsew')
    
    def log(self, message):
        # ฟังก์ชันสำหรับส่ง Log ไปแสดงผล
        timestamp = datetime.now().strftime("%H:%M:%S")
        self.log_queue.put(f"[{timestamp}] {message}")

    def process_log_queue(self):
        # ฟังก์ชันสำหรับวนลูปดึง Log จาก Queue มาแสดง
        try:
            while True:
                message = self.log_queue.get_nowait()
                self.log_area.config(state=tk.NORMAL)
                self.log_area.insert(tk.END, message + "\n")
                self.log_area.yview(tk.END)
                self.log_area.config(state=tk.DISABLED)
        except queue.Empty:
            pass
        finally:
            self.master.after(100, self.process_log_queue)

    def start_load_users_thread(self):
        # เริ่ม Thread โหลดรายชื่อผู้ใช้
        threading.Thread(target=self.load_users_for_combobox, daemon=True).start()

    def load_users_for_combobox(self):
        # โหลดรายชื่อผู้ใช้จาก API และกรองตาม HCODE ที่ใส่
        
        entered_hcode = self.hcode_var.get().strip()
        if not entered_hcode:
            messagebox.showerror("ต้องการ HCODE", "กรุณากรอก HCODE ในช่องตั้งค่าก่อน แล้วกดปุ่ม 'โหลดผู้ใช้งาน'")
            return

        self.log(f"กำลังโหลดรายชื่อผู้ใช้สำหรับ HCODE: {entered_hcode}...")
        self.load_users_button.config(state=tk.DISABLED)
        try:
            api_endpoint = f"{self.api_url_var.get()}/api/users"
            response = requests.get(api_endpoint, timeout=10)
            response.raise_for_status()
            self.full_user_list = response.json()
            
            self.filtered_user_list = [
                user for user in self.full_user_list 
                if user.get('is_active') and str(user.get('hcode')) == entered_hcode
            ]
            
            sorted_users = sorted(self.filtered_user_list, key=lambda u: u.get('full_name', ''))
            
            user_display_list = [user['full_name'] for user in sorted_users]
            
            def update_combobox():
                self.dispenser_combobox['values'] = []
                self.dispenser_combobox.set('')
                self.dispenser_combobox['values'] = user_display_list
                if user_display_list:
                    self.dispenser_combobox.current(0)
                    self.log(f"โหลดผู้ใช้สำหรับ HCODE {entered_hcode} สำเร็จ: {len(user_display_list)} คน")
                else:
                    self.log(f"ไม่พบผู้ใช้งานสำหรับ HCODE {entered_hcode}")

            self.master.after(0, update_combobox)

        except Exception as e:
            self.log(f"ผิดพลาด: ไม่สามารถโหลดรายชื่อผู้ใช้ได้ - {e}")
            self.master.after(0, lambda: messagebox.showerror("โหลดผู้ใช้ล้มเหลว", f"ไม่สามารถดึงรายชื่อผู้ใช้จาก API ได้\n{e}"))
        finally:
            self.master.after(0, lambda: self.load_users_button.config(state=tk.NORMAL))


    def set_drug_list_ui_state(self, fetch_state=None, compare_state=None, send_state=None):
        # ควบคุมสถานะปุ่มใน Tab 1
        if fetch_state is not None: self.fetch_drug_list_button.config(state=fetch_state)
        if compare_state is not None: self.compare_button.config(state=compare_state)
        if send_state is not None: self.send_drug_list_button.config(state=send_state)

    def start_fetch_drug_list_thread(self):
        # เริ่ม Thread ดึงรายการยา
        self.set_drug_list_ui_state(fetch_state=tk.DISABLED, compare_state=tk.DISABLED, send_state=tk.DISABLED)
        threading.Thread(target=self.fetch_drug_list_data, daemon=True).start()

    def fetch_drug_list_data(self):
        # ดึงรายการยาจาก Local DB
        self.log("[Tab 1] ดึงรายการยา: เริ่มต้น...")
        try:
            self.master.after(0, lambda: self.drug_list_tree.delete(*self.drug_list_tree.get_children()))
            self.drug_list_data = []
            conn = mysql.connector.connect(host=self.db_host_var.get(), database=self.db_name_var.get(), user=self.db_user_var.get(), password=self.db_pass_var.get(), connect_timeout=5)
            cursor = conn.cursor(dictionary=True)
            cursor.execute("SELECT icode, name, strength, units FROM drugitems WHERE istatus = 'y'")
            self.drug_list_data = cursor.fetchall()
            conn.close()
            if not self.drug_list_data:
                self.log("[Tab 1] ดึงรายการยา: ไม่พบข้อมูล")
                self.master.after(0, lambda: self.set_drug_list_ui_state(fetch_state=tk.NORMAL))
                return
            self.log(f"[Tab 1] ดึงรายการยา: สำเร็จ {len(self.drug_list_data)} รายการ")
            for item in self.drug_list_data:
                values = ('-', item['icode'], item['name'], item['strength'], item['units'])
                self.master.after(0, lambda i=item, v=values: self.drug_list_tree.insert("", tk.END, values=v, iid=f"drug_{i['icode']}"))
            self.master.after(0, lambda: self.set_drug_list_ui_state(fetch_state=tk.NORMAL, compare_state=tk.NORMAL))
        except Exception as e:
            self.log(f"[Tab 1] ดึงรายการยา: ผิดพลาด - {e}")
            messagebox.showerror("ผิดพลาด", f"ไม่สามารถดึงรายการยาได้:\n{e}")
            self.master.after(0, lambda: self.set_drug_list_ui_state(fetch_state=tk.NORMAL))

    def start_compare_thread(self):
        # เริ่ม Thread เปรียบเทียบข้อมูล
        self.set_drug_list_ui_state(fetch_state=tk.DISABLED, compare_state=tk.DISABLED, send_state=tk.DISABLED)
        threading.Thread(target=self.compare_with_central_db, daemon=True).start()

    def compare_with_central_db(self):
        # เปรียบเทียบรายการยากับข้อมูลกลาง
        self.log("[Tab 1] เปรียบเทียบรายการยา: เริ่มต้น...")
        hcode = self.hcode_var.get().strip()
        if not hcode:
            messagebox.showerror("ข้อมูลไม่ครบถ้วน", "กรุณากรอก HCODE")
            self.master.after(0, lambda: self.set_drug_list_ui_state(fetch_state=tk.NORMAL, compare_state=tk.NORMAL))
            return
        try:
            api_endpoint = f"{self.api_url_var.get()}/api/medicines?hcode={hcode}"
            response = requests.get(api_endpoint, timeout=15)
            response.raise_for_status()
            central_data = response.json()
            self.central_drug_codes = {str(med['medicine_code']) for med in central_data}
            self.log(f"[Tab 1] เปรียบเทียบรายการยา: พบข้อมูลในระบบกลาง {len(self.central_drug_codes)} รายการ")
            new_count, duplicate_count = 0, 0
            for item_id in self.drug_list_tree.get_children():
                item_code = self.drug_list_tree.item(item_id, 'values')[1]
                if item_code in self.central_drug_codes:
                    self.master.after(0, lambda iid=item_id: self.drug_list_tree.item(iid, tags=('duplicate',), values=('ซ้ำ', *self.drug_list_tree.item(iid, 'values')[1:])))
                    duplicate_count += 1
                else:
                    self.master.after(0, lambda iid=item_id: self.drug_list_tree.item(iid, tags=('new',), values=('ยาใหม่', *self.drug_list_tree.item(iid, 'values')[1:])))
                    new_count += 1
            self.log(f"[Tab 1] เปรียบเทียบรายการยา: ยาใหม่ {new_count}, ยาซ้ำ {duplicate_count}")
            self.master.after(0, lambda: self.set_drug_list_ui_state(fetch_state=tk.NORMAL, compare_state=tk.NORMAL, send_state=tk.NORMAL if new_count > 0 else tk.DISABLED))
        except Exception as e:
            self.log(f"[Tab 1] เปรียบเทียบรายการยา: ผิดพลาด - {e}")
            messagebox.showerror("ผิดพลาด", f"ไม่สามารถเปรียบเทียบข้อมูลได้:\n{e}")
            self.master.after(0, lambda: self.set_drug_list_ui_state(fetch_state=tk.NORMAL, compare_state=tk.NORMAL))

    def start_send_drug_list_thread(self):
        # เริ่ม Thread ส่งรายการยาใหม่
        self.set_drug_list_ui_state(fetch_state=tk.DISABLED, compare_state=tk.DISABLED, send_state=tk.DISABLED)
        threading.Thread(target=self.send_drug_list_to_api, daemon=True).start()

    def send_drug_list_to_api(self):
        # ส่งรายการยาใหม่ไปที่ API
        self.log("[Tab 1] ส่งรายการยาใหม่: เริ่มต้น...")
        items_to_send = [item_id for item_id in self.drug_list_tree.get_children() if 'new' in self.drug_list_tree.item(item_id, 'tags')]
        if not items_to_send:
            self.master.after(0, lambda: self.set_drug_list_ui_state(fetch_state=tk.NORMAL, compare_state=tk.NORMAL))
            return
        self.master.after(0, lambda: self.drug_list_progress.config(maximum=len(items_to_send), value=0))
        success_count, error_count = 0, 0
        hcode = self.hcode_var.get().strip()
        api_endpoint = f"{self.api_url_var.get()}/api/medicines"
        for i, item_id in enumerate(items_to_send):
            values = self.drug_list_tree.item(item_id, 'values')
            payload = {"hcode": hcode, "medicine_code": values[1], "generic_name": values[2], "strength": values[3], "unit": values[4]}
            try:
                response = requests.post(api_endpoint, json=payload, timeout=10)
                if response.status_code == 201:
                    success_count += 1
                    self.master.after(0, lambda iid=item_id: self.drug_list_tree.item(iid, tags=('sent',), values=('ส่งแล้ว', *self.drug_list_tree.item(iid, 'values')[1:])))
                else: error_count += 1
            except requests.exceptions.RequestException: error_count += 1
            self.master.after(0, lambda v=i+1: self.drug_list_progress.config(value=v))
        self.log(f"[Tab 1] ส่งรายการยาใหม่: สำเร็จ {success_count}, ผิดพลาด {error_count}")
        self.master.after(0, lambda: self.set_drug_list_ui_state(fetch_state=tk.NORMAL, compare_state=tk.NORMAL, send_state=tk.DISABLED))
        
    def start_fetch_dispense_thread(self):
        # เริ่ม Thread ดึงและเตรียมข้อมูลจ่ายยา
        self.fetch_dispense_button.config(state=tk.DISABLED)
        self.send_dispense_button.config(state=tk.DISABLED)
        threading.Thread(target=self.fetch_and_prepare_dispense_data, daemon=True).start()

    def fetch_and_prepare_dispense_data(self):
        # ดึงข้อมูลจ่ายยาและตรวจสอบกับข้อมูลยาหลัก
        self.log("[Tab 2] นำเข้าข้อมูลจ่ายยา: เริ่มกระบวนการ...")
        self.master.after(0, lambda: self.dispense_tree.delete(*self.dispense_tree.get_children()))
        self.dispense_data = []
        self.medicine_code_map = {}
        hcode = self.hcode_var.get().strip()
        if not hcode:
            messagebox.showerror("ข้อมูลไม่ครบถ้วน", "กรุณากรอก HCODE ใน Tab แรกก่อน")
            self.master.after(0, lambda: self.fetch_dispense_button.config(state=tk.NORMAL))
            return
        
        try:
            self.log("[Tab 2] ...กำลังดึงข้อมูลยาหลัก (Master) จากระบบกลาง")
            api_endpoint = f"{self.api_url_var.get()}/api/medicines?hcode={hcode}"
            response = requests.get(api_endpoint, timeout=15)
            response.raise_for_status()
            central_medicines = response.json()
            self.medicine_code_map = {str(med['medicine_code']): med['id'] for med in central_medicines}
            self.log(f"[Tab 2] ...ดึงข้อมูลยาหลักสำเร็จ {len(self.medicine_code_map)} รายการ")
            self.log("[Tab 2] ...กำลังดึงข้อมูลจ่ายยาจาก HOSxP")
            start_date = self.start_date_entry.entry.get()
            end_date = self.end_date_entry.entry.get()
            formatted_start_date = datetime.strptime(start_date, '%d/%m/%Y').strftime('%Y-%m-%d')
            formatted_end_date = datetime.strptime(end_date, '%d/%m/%Y').strftime('%Y-%m-%d')

            conn = mysql.connector.connect(host=self.db_host_var.get(), database=self.db_name_var.get(), user=self.db_user_var.get(), password=self.db_pass_var.get(), connect_timeout=5)
            cursor = conn.cursor(dictionary=True)
            query = "SELECT icode, hos_guid, qty, vstdate FROM opitemrece WHERE vstdate BETWEEN %s AND %s"
            cursor.execute(query, (formatted_start_date, formatted_end_date))
            local_dispense_data = cursor.fetchall()
            conn.close()

            if not local_dispense_data:
                self.log("[Tab 2] ...ไม่พบข้อมูลจ่ายยาในช่วงวันที่ที่เลือก")
                self.master.after(0, lambda: self.fetch_dispense_button.config(state=tk.NORMAL))
                return
            
            self.log("[Tab 2] ...กำลังตรวจสอบและเตรียมข้อมูล")
            ready_count = 0
            for item in local_dispense_data:
                icode = str(item['icode'])
                medicine_id = self.medicine_code_map.get(icode)
                vstdate_str = item['vstdate'].strftime('%Y-%m-%d') if isinstance(item['vstdate'], datetime) else str(item['vstdate'])
                if medicine_id:
                    status = "พร้อมส่ง"
                    tag = 'ready'
                    ready_count += 1
                else:
                    status = "ผิดพลาด: ไม่พบรหัสยานี้ในระบบกลาง"
                    tag = 'error'
                item['medicine_id'] = medicine_id
                item['dispense_date_iso'] = vstdate_str
                item['status'] = status
                self.dispense_data.append(item)
                values = (status, vstdate_str, icode, item['hos_guid'], f"{item['qty']:.2f}")
                self.master.after(0, lambda v=values, t=tag: self.dispense_tree.insert("", tk.END, values=v, tags=(t,)))

            self.log(f"[Tab 2] ดึงข้อมูลจ่ายยาสำเร็จ {len(self.dispense_data)} รายการ (พร้อมส่ง: {ready_count})")
            self.master.after(0, lambda: (self.fetch_dispense_button.config(state=tk.NORMAL), self.send_dispense_button.config(state=tk.NORMAL if ready_count > 0 else tk.DISABLED)))

        except Exception as e:
            self.log(f"[Tab 2] เกิดข้อผิดพลาดร้ายแรง: {e}")
            messagebox.showerror("ผิดพลาด", f"เกิดข้อผิดพลาดในกระบวนการดึงข้อมูล:\n{e}")
            self.master.after(0, lambda: self.fetch_dispense_button.config(state=tk.NORMAL))

    def start_send_dispense_thread(self):
        # เริ่ม Thread ส่งข้อมูลจ่ายยา
        items_ready_count = sum(1 for item in self.dispense_data if item['status'] == 'พร้อมส่ง')
        if items_ready_count == 0:
            messagebox.showwarning("ไม่มีข้อมูล", "ไม่มีรายการที่พร้อมสำหรับส่ง")
            return
        
        if messagebox.askyesno("ยืนยันการตัดจ่ายยา", f"คุณต้องการส่งข้อมูลการจ่ายยาทั้งหมด {items_ready_count} รายการเพื่อตัดสต็อกใช่หรือไม่?\n(รายการที่ผิดพลาดจะถูกข้ามไป)\nการกระทำนี้ไม่สามารถย้อนกลับได้", icon='warning'):
            self.fetch_dispense_button.config(state=tk.DISABLED)
            self.send_dispense_button.config(state=tk.DISABLED)
            threading.Thread(target=self.send_dispense_data_to_api, daemon=True).start()

    def send_dispense_data_to_api(self):
        # ส่งข้อมูลจ่ายยาไปที่ API
        self.log("[Tab 2] ส่งข้อมูลตัดจ่ายยา: เริ่มต้น...")
        hcode = self.hcode_var.get().strip()
        selected_user_display = self.dispenser_combobox.get()
        
        if not selected_user_display:
            messagebox.showerror("ข้อมูลไม่ครบถ้วน", "กรุณาเลือกผู้จ่ายยาจาก Dropdown")
            self.master.after(0, lambda: (self.fetch_dispense_button.config(state=tk.NORMAL), self.send_dispense_button.config(state=tk.NORMAL)))
            return

        dispenser_id = None
        for user in self.filtered_user_list: # ค้นหาในลิสต์ที่กรองแล้ว
            if user['full_name'] == selected_user_display:
                dispenser_id = user['id']
                break
        
        if dispenser_id is None:
            messagebox.showerror("ผิดพลาด", "ไม่พบ ID สำหรับผู้ใช้ที่เลือก")
            self.master.after(0, lambda: (self.fetch_dispense_button.config(state=tk.NORMAL), self.send_dispense_button.config(state=tk.NORMAL)))
            return
        
        api_endpoint = f"{self.api_url_var.get()}/api/dispense/process_excel_dispense"
        items_to_send = [{"medicine_id": item['medicine_id'], "quantity_dispensed": float(item['qty']), "hos_guid": str(item['hos_guid']), "dispense_date_iso": item['dispense_date_iso']} for item in self.dispense_data if item['status'] == 'พร้อมส่ง']
        payload = {"hcode": hcode, "dispenser_id": dispenser_id, "dispense_items": items_to_send}

        self.log(f"[Tab 2] ...กำลังส่ง {len(items_to_send)} รายการไปที่ {api_endpoint}")
        try:
            response = requests.post(api_endpoint, json=payload, timeout=120)
            if response.status_code in [201, 207]:
                res_data = response.json()
                self.log(f"[Tab 2] ส่งข้อมูลสำเร็จ: {res_data.get('message')}")
                messagebox.showinfo("สำเร็จ", res_data.get('message', "ส่งข้อมูลเพื่อตัดจ่ายยาเรียบร้อยแล้ว"))
                self.master.after(0, lambda: self.dispense_tree.delete(*self.dispense_tree.get_children()))
                self.dispense_data = []
            else:
                error_detail = response.json().get('error', response.text)
                self.log(f"[Tab 2] ส่งข้อมูลผิดพลาด: {response.status_code} - {error_detail}")
                messagebox.showerror("API Error", f"เกิดข้อผิดพลาดจาก API:\n{error_detail}")
        except requests.exceptions.RequestException as e:
            self.log(f"[Tab 2] ส่งข้อมูลผิดพลาด (เชื่อมต่อ): {e}")
            messagebox.showerror("Connection Error", f"ไม่สามารถเชื่อมต่อ API ได้:\n{e}")
        finally:
             self.master.after(0, lambda: (self.fetch_dispense_button.config(state=tk.NORMAL), self.send_dispense_button.config(state=tk.DISABLED)))

if __name__ == "__main__":
    app = bttk.Window(
        title="Drug Importer to Central API (v9 - HCODE-Filtered Users)", themename="litera",
        size=(1000, 850), position=(100, 50), resizable=(True, True))
    DrugImporterApp(app)
    app.mainloop()
