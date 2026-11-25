-- Same barcode/work-order/model joins as MD_CustomReport 211.
-- Return one serial card, not the report's multiplied outgoing/incoming join.
SET TRANSACTION ISOLATION LEVEL READ COMMITTED;
SELECT PSC.RecId AS SerialCardId, PSC.SerialNo AS Barcode,
 I.PatternNo,I.MarkId,I.ItemDepartmentId AS DepartmentId,I.RecId AS SampleRecId,I.InventoryCode AS SampleCode,I.InventoryName AS ModelName,
 I.StyleSampleRevisionNo AS Version,I.MainStyleCardId AS MainRecId,M.InventoryCode AS MainCode,
 I.StyleSampleTypeId AS SampleTypeId,S.SampleTypeName,
 MK.Explanation AS Brand,D.DepartmentName AS Department,
 WO.WorkOrderNo AS OrderNo,PSC.Quantity,
 C.OperationCode AS Color,C.RequirementGroup AS SupplyGroup,
 B.BodyName,I.UD_IWSTotalMin AS StudyMinutes,
 CASE WHEN PSC.InsertedAt >= @since AND PSC.InsertedAt <= @until THEN PSC.InsertedAt END AS SerialCreatedAt, CASE WHEN PSC.InsertedAt >= @since AND PSC.InsertedAt <= @until THEN 0 ELSE 1 END AS EarlierBarcode,PSC.UpdatedAt AS SerialUpdatedAt,
 (SELECT TOP(1) A.RecId FROM dbo.IM_ItemAttachment A WHERE A.InventoryId=I.RecId AND ISNULL(A.IsDeleted,0)=0 AND (A.Attachment IS NOT NULL OR A.Thumbnail IS NOT NULL) ORDER BY A.RecId DESC) AS AttachmentId,
 (SELECT TOP(1) A.RecId FROM dbo.IM_ItemAttachment A WHERE A.InventoryId=M.RecId AND ISNULL(A.IsDeleted,0)=0 AND (A.Attachment IS NOT NULL OR A.Thumbnail IS NOT NULL) ORDER BY A.RecId DESC) AS MainAttachmentId
FROM dbo.MA_ProductivitySerialCard PSC
JOIN dbo.MA_WorkOrder WO ON WO.RecId=PSC.WorkOrderId AND ISNULL(WO.IsDeleted,0)=0
JOIN dbo.MA_WorkOrderItem WOI ON WOI.RecId=PSC.WorkOrderItemId AND ISNULL(WOI.IsDeleted,0)=0
JOIN dbo.IM_Item I ON I.RecId=WOI.InventoryId AND ISNULL(I.IsDeleted,0)=0
LEFT JOIN dbo.IM_Item M ON M.RecId=I.MainStyleCardId
LEFT JOIN dbo.MA_WorkOrderItem C ON C.RecId=PSC.WorkOrderItemCId
LEFT JOIN dbo.IM_Mark MK ON MK.RecId=I.MarkId
LEFT JOIN dbo.IM_ItemDepartment D ON D.RecId=I.ItemDepartmentId
LEFT JOIN dbo.MD_StyleSampleType S ON S.RecId=I.StyleSampleTypeId
OUTER APPLY (SELECT Name AS BodyName FROM dbo.tfx_DelimitedStringToTable(ISNULL(WO.SText,'XS#@#S#@#M#@#L#@#XL#@#XXL'),'#@#') WHERE SortNo=PSC.SSubNo) B
WHERE ISNULL(PSC.IsDeleted,0)=0 AND PSC.RecId IN (SELECT RecId FROM #ChangedSerial);
