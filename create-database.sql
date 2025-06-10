-- --------------------------------------------------------
-- Database: `shph_inventory_db`
-- --------------------------------------------------------
CREATE DATABASE IF NOT EXISTS `shph_inventory_db` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `shph_inventory_db`;

-- --------------------------------------------------------

--
-- Table structure for table `unitservice`
-- ตารางเก็บข้อมูลหน่วยบริการ (รพสต. หรือ รพ.แม่ข่าย)
--
CREATE TABLE IF NOT EXISTS `unitservice` (
  `hcode` VARCHAR(5) NOT NULL COMMENT 'รหัสหน่วยบริการ (ตามมาตรฐาน สปสช. 5 หลัก)',
  `name` VARCHAR(255) NOT NULL COMMENT 'ชื่อหน่วยบริการ',
  `type` ENUM('รพสต.', 'รพ.แม่ข่าย', 'อื่นๆ') DEFAULT 'รพสต.' COMMENT 'ประเภทหน่วยบริการ',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`hcode`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='ตารางข้อมูลหน่วยบริการ';

-- --------------------------------------------------------

--
-- Table structure for table `users`
-- ตารางเก็บข้อมูลผู้ใช้งานระบบ
--
CREATE TABLE IF NOT EXISTS `users` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `username` VARCHAR(100) NOT NULL UNIQUE COMMENT 'ชื่อผู้ใช้งาน (สำหรับเข้าระบบ)',
  `password_hash` VARCHAR(255) NOT NULL COMMENT 'รหัสผ่านที่เข้ารหัสแล้ว',
  `full_name` VARCHAR(255) NOT NULL COMMENT 'ชื่อ-นามสกุลเต็ม',
  `role` ENUM('เจ้าหน้าที่ รพสต.', 'เจ้าหน้าที่ รพ. แม่ข่าย', 'ผู้ดูแลระบบ') NOT NULL COMMENT 'บทบาทผู้ใช้งาน',
  `hcode` VARCHAR(5) NULL COMMENT 'รหัสหน่วยบริการที่ผู้ใช้สังกัด (อ้างอิง unitservice.hcode)',
  `is_active` BOOLEAN DEFAULT TRUE COMMENT 'สถานะการใช้งาน (TRUE=ใช้งาน, FALSE=ไม่ใช้งาน)',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`hcode`) REFERENCES `unitservice`(`hcode`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='ตารางผู้ใช้งานระบบ';

-- --------------------------------------------------------

--
-- Table structure for table `medicines`
-- ตารางเก็บข้อมูลยา (กำหนดและจัดการโดยแต่ละหน่วยบริการ)
--
CREATE TABLE IF NOT EXISTS `medicines` (
  `id` INT AUTO_INCREMENT PRIMARY KEY COMMENT 'ID ของรายการยาในระบบ (Unique ทั่วระบบ)',
  `hcode` VARCHAR(5) NOT NULL COMMENT 'รหัสหน่วยบริการที่กำหนด/จัดการยานี้ (อ้างอิง unitservice.hcode)',
  `medicine_code` VARCHAR(50) NOT NULL COMMENT 'รหัสยาที่หน่วยบริการนั้นๆ ใช้ (อาจไม่ซ้ำกันระหว่างหน่วยบริการ)',
  `generic_name` VARCHAR(255) NOT NULL COMMENT 'ชื่อสามัญทางยา',
  `strength` VARCHAR(100) COMMENT 'ความแรงของยา',
  `unit` VARCHAR(50) NOT NULL COMMENT 'หน่วยนับ (เช่น เม็ด, ขวด, หลอด)',
  `reorder_point` INT DEFAULT 0 COMMENT 'จุดสั่งซื้อขั้นต่ำสำหรับยานี้ที่หน่วยบริการนี้',
  `is_active` BOOLEAN DEFAULT TRUE COMMENT 'สถานะยา (TRUE=ยังมีการใช้งานที่หน่วยบริการนี้)',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`hcode`) REFERENCES `unitservice`(`hcode`) ON DELETE CASCADE ON UPDATE CASCADE,
  UNIQUE KEY `hcode_medicine_code_unique` (`hcode`, `medicine_code`) COMMENT 'รหัสยาต้องไม่ซ้ำกันภายในหน่วยบริการเดียวกัน'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='ข้อมูลยาที่แต่ละหน่วยบริการจัดการ';

-- --------------------------------------------------------

--
-- Table structure for table `inventory`
-- ตารางคลังยา (เก็บยอดคงเหลือแยกตาม Lot และ หน่วยบริการ)
--
CREATE TABLE IF NOT EXISTS `inventory` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `hcode` VARCHAR(5) NOT NULL COMMENT 'รหัสหน่วยบริการเจ้าของคลัง (อ้างอิง unitservice.hcode)',
  `medicine_id` INT NOT NULL COMMENT 'รหัสอ้างอิงยาจากตาราง medicines (ซึ่ง medicines.id นี้จะผูกกับ hcode ที่กำหนดยาอยู่แล้ว)',
  `lot_number` VARCHAR(100) NOT NULL COMMENT 'เลขที่ล็อตของยา',
  `expiry_date` DATE NOT NULL COMMENT 'วันหมดอายุของยาในล็อตนี้',
  `quantity_on_hand` INT DEFAULT 0 COMMENT 'จำนวนคงเหลือในคลังของล็อตนี้',
  `received_date` DATE COMMENT 'วันที่รับยาล็อตนี้เข้าคลังครั้งแรก',
  `last_updated` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`hcode`) REFERENCES `unitservice`(`hcode`) ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY (`medicine_id`) REFERENCES `medicines`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  UNIQUE KEY `hcode_medicine_lot_expiry_unique` (`hcode`, `medicine_id`, `lot_number`, `expiry_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='ข้อมูลยาคงคลังแยกตามล็อตและหน่วยบริการ';

-- --------------------------------------------------------

--
-- Table structure for table `requisitions`
-- ตารางใบเบิกยา
--
CREATE TABLE IF NOT EXISTS `requisitions` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `requisition_number` VARCHAR(50) UNIQUE NOT NULL COMMENT 'เลขที่ใบเบิก',
  `requisition_date` DATE NOT NULL COMMENT 'วันที่ทำรายการเบิก',
  `requester_id` INT NOT NULL COMMENT 'รหัสผู้เบิก (อ้างอิง users.id)',
  `requester_hcode` VARCHAR(5) NOT NULL COMMENT 'รหัสหน่วยบริการของผู้ขอเบิก (อ้างอิง unitservice.hcode)',
  `status` ENUM('รออนุมัติ', 'อนุมัติแล้ว', 'อนุมัติบางส่วน', 'ปฏิเสธ', 'รับยาแล้ว', 'ยกเลิก') NOT NULL DEFAULT 'รออนุมัติ' COMMENT 'สถานะใบเบิก',
  `remarks` TEXT COMMENT 'หมายเหตุเพิ่มเติม',
  `approved_by_id` INT NULL COMMENT 'รหัสผู้อนุมัติ (อ้างอิง users.id จาก รพ.แม่ข่าย)',
  `approver_hcode` VARCHAR(5) NULL COMMENT 'รหัสหน่วยบริการของผู้อนุมัติ (รพ.แม่ข่าย)',
  `approval_date` DATE NULL COMMENT 'วันที่อนุมัติใบเบิก',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`requester_id`) REFERENCES `users`(`id`),
  FOREIGN KEY (`requester_hcode`) REFERENCES `unitservice`(`hcode`),
  FOREIGN KEY (`approved_by_id`) REFERENCES `users`(`id`),
  FOREIGN KEY (`approver_hcode`) REFERENCES `unitservice`(`hcode`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='ข้อมูลใบเบิกยา';

-- --------------------------------------------------------

--
-- Table structure for table `requisition_items`
-- ตารางรายการยาในใบเบิก
--
CREATE TABLE IF NOT EXISTS `requisition_items` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `requisition_id` INT NOT NULL COMMENT 'รหัสใบเบิก (อ้างอิง requisitions.id)',
  `medicine_id` INT NOT NULL COMMENT 'รหัสยา (อ้างอิง medicines.id ที่ถูกกำหนดโดย requester_hcode ของใบเบิก)',
  `quantity_requested` INT NOT NULL COMMENT 'จำนวนที่ขอเบิก',
  `quantity_approved` INT DEFAULT 0 COMMENT 'จำนวนที่อนุมัติจ่าย (โดย รพ.แม่ข่าย)',
  `approved_lot_number` VARCHAR(100) NULL COMMENT 'เลขที่ล็อตที่ รพ.แม่ข่ายอนุมัติให้ (ถ้ามี)',
  `approved_expiry_date` DATE NULL COMMENT 'วันหมดอายุของล็อตที่ รพ.แม่ข่ายอนุมัติให้ (ถ้ามี)',
  `item_approval_status` ENUM('รออนุมัติ', 'อนุมัติ', 'แก้ไขจำนวน', 'ปฏิเสธ') DEFAULT 'รออนุมัติ' COMMENT 'สถานะการอนุมัติของรายการยานี้',
  `reason_for_change_or_rejection` TEXT COMMENT 'เหตุผลกรณีแก้ไขจำนวนหรือปฏิเสธ',
  FOREIGN KEY (`requisition_id`) REFERENCES `requisitions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY (`medicine_id`) REFERENCES `medicines`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='รายการยาในแต่ละใบเบิก';

-- --------------------------------------------------------

--
-- Table structure for table `goods_received_vouchers`
-- ตารางเอกสารการรับยาเข้าคลัง
--
CREATE TABLE IF NOT EXISTS `goods_received_vouchers` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `hcode` VARCHAR(5) NOT NULL COMMENT 'รหัสหน่วยบริการที่รับยา (อ้างอิง unitservice.hcode)',
  `voucher_number` VARCHAR(50) UNIQUE COMMENT 'เลขที่เอกสารการรับยา (ถ้ามี)',
  `requisition_id` INT NULL COMMENT 'รหัสใบเบิกที่อ้างอิง (ถ้าเป็นการรับจากใบเบิก)',
  `received_date` DATE NOT NULL COMMENT 'วันที่รับยาเข้าคลัง',
  `receiver_id` INT NOT NULL COMMENT 'รหัสผู้รับยา (อ้างอิง users.id)',
  `supplier_name` VARCHAR(255) COMMENT 'ชื่อผู้ส่ง/แหล่งที่มา (เช่น รพ.แม่ข่าย, ชื่อบริษัท)',
  `invoice_number` VARCHAR(100) COMMENT 'เลขที่ใบส่งของ/ใบกำกับภาษี (ถ้ามี)',
  `remarks` TEXT COMMENT 'หมายเหตุเพิ่มเติม',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`hcode`) REFERENCES `unitservice`(`hcode`) ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY (`requisition_id`) REFERENCES `requisitions`(`id`),
  FOREIGN KEY (`receiver_id`) REFERENCES `users`(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='เอกสารการรับยาเข้าคลัง';

-- --------------------------------------------------------

--
-- Table structure for table `goods_received_items`
-- ตารางรายการยาที่รับเข้าคลังในแต่ละเอกสาร
--
CREATE TABLE IF NOT EXISTS `goods_received_items` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `goods_received_voucher_id` INT NOT NULL COMMENT 'รหัสเอกสารการรับยา (อ้างอิง goods_received_vouchers.id)',
  `medicine_id` INT NOT NULL COMMENT 'รหัสยา (อ้างอิง medicines.id ที่ถูกกำหนดโดย hcode ของ goods_received_vouchers)',
  `lot_number` VARCHAR(100) NOT NULL COMMENT 'เลขที่ล็อตของยาที่รับ',
  `expiry_date` DATE NOT NULL COMMENT 'วันหมดอายุของยาที่รับ',
  `quantity_received` INT NOT NULL COMMENT 'จำนวนที่รับจริง',
  `unit_price` DECIMAL(10,2) DEFAULT 0.00 COMMENT 'ราคาต่อหน่วย (ถ้ามี)',
  `notes` VARCHAR(255) COMMENT 'หมายเหตุสำหรับรายการนี้',
  FOREIGN KEY (`goods_received_voucher_id`) REFERENCES `goods_received_vouchers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY (`medicine_id`) REFERENCES `medicines`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='รายการยาที่รับเข้าในแต่ละครั้ง';

-- --------------------------------------------------------

--
-- Table structure for table `dispense_records`
-- ตารางบันทึกการตัดจ่ายยา
--
CREATE TABLE IF NOT EXISTS `dispense_records` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `hcode` VARCHAR(5) NOT NULL COMMENT 'รหัสหน่วยบริการที่จ่ายยา (อ้างอิง unitservice.hcode)',
  `dispense_record_number` VARCHAR(50) UNIQUE COMMENT 'เลขที่เอกสารการตัดจ่าย (ถ้ามี)',
  `dispense_date` DATE NOT NULL COMMENT 'วันที่จ่ายยา',
  `dispenser_id` INT NOT NULL COMMENT 'รหัสผู้จ่ายยา (อ้างอิง users.id)',
  `dispense_type` ENUM('ผู้ป่วยนอก', 'ผู้ป่วยใน', 'หน่วยงานภายใน', 'อื่นๆ') DEFAULT 'ผู้ป่วยนอก' COMMENT 'ประเภทการจ่าย',
  `remarks` TEXT COMMENT 'หมายเหตุเพิ่มเติม',
  `status` TEXT COMMENT 'สถานะการตัดจ่าย',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`hcode`) REFERENCES `unitservice`(`hcode`) ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY (`dispenser_id`) REFERENCES `users`(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='ข้อมูลการตัดจ่ายยา';

-- --------------------------------------------------------

--
-- Table structure for table `dispense_items`
-- ตารางรายการยาที่ตัดจ่ายในแต่ละครั้ง
--
CREATE TABLE IF NOT EXISTS `dispense_items` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `dispense_record_id` INT NOT NULL COMMENT 'รหัสการตัดจ่าย (อ้างอิง dispense_records.id)',
  `medicine_id` INT NOT NULL COMMENT 'รหัสยา (อ้างอิง medicines.id ที่ถูกกำหนดโดย hcode ของ dispense_records)',
  `lot_number` VARCHAR(100) NOT NULL COMMENT 'เลขที่ล็อตของยาที่จ่าย',
  `expiry_date` DATE NOT NULL COMMENT 'วันหมดอายุของยาที่จ่าย',
  `quantity_dispensed` INT NOT NULL COMMENT 'จำนวนที่จ่าย',
  `dispense_date` DATE COMMENT 'วันที่จ่ายยาจริงของรายการนี้',
	`item_status` TEXT COMMENT 'สถานะของรายการยานี้',
  FOREIGN KEY (`dispense_record_id`) REFERENCES `dispense_records`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY (`medicine_id`) REFERENCES `medicines`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='รายการยาที่ตัดจ่ายในแต่ละครั้ง';

-- --------------------------------------------------------

--
-- Table structure for table `inventory_transactions`
-- ตารางประวัติการเคลื่อนไหวของยา (Audit Trail)
--
CREATE TABLE IF NOT EXISTS `inventory_transactions` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `hcode` VARCHAR(5) NOT NULL COMMENT 'รหัสหน่วยบริการที่เกิด transaction (อ้างอิง unitservice.hcode)',
  `medicine_id` INT NOT NULL COMMENT 'รหัสยา (อ้างอิง medicines.id)',
  `lot_number` VARCHAR(100) NOT NULL,
  `expiry_date` DATE NOT NULL,
  `transaction_type` ENUM('รับเข้า-ใบเบิก', 'รับเข้า-ตรง', 'จ่ายออก-ผู้ป่วย', 'ปรับปรุงยอด-เพิ่ม', 'ปรับปรุงยอด-ลด', 'คืนยา', 'โอนย้าย', 'อื่นๆ') NOT NULL COMMENT 'ประเภทรายการ',
  `quantity_change` INT NOT NULL COMMENT 'จำนวนที่เปลี่ยนแปลง (+ สำหรับเพิ่ม, - สำหรับลด)',
  `quantity_before_transaction` INT NOT NULL COMMENT 'ยอดคงเหลือ (ของ Lot นี้) ก่อนทำรายการ',
  `quantity_after_transaction` INT NOT NULL COMMENT 'ยอดคงเหลือ (ของ Lot นี้) หลังทำรายการ',
  `transaction_date` TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT 'วันเวลาที่ทำรายการ',
  `reference_document_id` VARCHAR(50) COMMENT 'เลขที่เอกสารอ้างอิง (เช่น เลขที่ใบเบิก, เลขที่ใบจ่าย)',
  `user_id` INT NOT NULL COMMENT 'ผู้ทำรายการ (อ้างอิง users.id)',
  `remarks` TEXT COMMENT 'หมายเหตุ',
  FOREIGN KEY (`hcode`) REFERENCES `unitservice`(`hcode`) ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY (`medicine_id`) REFERENCES `medicines`(`id`),
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='ประวัติการเคลื่อนไหวของยาในคลัง';

-- --------------------------------------------------------

--
-- Insert default admin user
--
INSERT INTO `users` (`username`, `password_hash`, `full_name`, `role`, `is_active`) 
VALUES ('admin', SHA2('1234', 256), 'Administrator', 'ผู้ดูแลระบบ', TRUE);
